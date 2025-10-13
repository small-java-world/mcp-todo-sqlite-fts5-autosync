import WebSocket from 'ws';

const PORT = 18765;
const ws = new WebSocket(`ws://localhost:${PORT}`);

let messageId = 1;

function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const timeout = setTimeout(() => {
      reject(new Error(`Request ${method} timed out`));
    }, 5000);

    const handler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          ws.off('message', handler);
          if (response.error) {
            reject(new Error(`${method} error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        }
      } catch (e) {
        // Ignore parse errors for other messages
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(request));
  });
}

async function runTests() {
  try {
    console.log('🔌 Connecting to MCP server...');

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    console.log('✅ Connected to MCP server on port', PORT);

    // Test 1: Create a task
    console.log('\n📝 Test 1: Creating a task...');
    const taskId = `T-TEST-${Date.now()}`;
    await sendRequest('upsert_task', {
      id: taskId,
      title: 'Test Task for MCP Connectivity',
      text: 'This is a test task to verify MCP functionality'
    });
    console.log(`✅ Task created: ${taskId}`);

    // Test 2: Get the task
    console.log('\n📖 Test 2: Getting the task...');
    const task = await sendRequest('get_task', { id: taskId });
    console.log(`✅ Task retrieved:`, {
      id: task.id,
      title: task.title,
      state: task.state
    });

    // Test 3: Submit requirements
    console.log('\n📋 Test 3: Submitting requirements...');
    const reqId = `REQ-TEST-${Date.now()}`;
    const reqResult = await sendRequest('ut.requirements.submit', {
      id: reqId,
      todo_id: taskId,
      raw_markdown: '# Requirements\n\n- Must work correctly\n- Must be testable',
      idempotency_key: `req-test-${Date.now()}`
    });
    console.log(`✅ Requirements submitted:`, reqResult);

    // Get the actual requirements ID
    const actualReqId = reqResult.requirements_id;

    // Test 4: Submit testcases
    console.log('\n🧪 Test 4: Submitting testcases...');
    const tcId = `TC-TEST-${Date.now()}`;
    const tcResult = await sendRequest('ut.testcases.submit', {
      id: tcId,
      requirements_id: actualReqId,
      todo_id: taskId,
      raw_markdown: '# Test Cases\n\n## TC-1: Basic Test\n- Given: System is ready\n- When: Test runs\n- Then: Success',
      idempotency_key: `tc-test-${Date.now()}`
    });
    console.log(`✅ Testcases submitted:`, tcResult);

    // Test 5: Get requirements
    console.log('\n📥 Test 5: Getting requirements...');
    const requirements = await sendRequest('ut.requirements.get', {
      todo_id: taskId
    });
    console.log(`✅ Requirements retrieved:`, {
      id: requirements.id,
      todo_id: requirements.todo_id
    });

    // Test 6: Project requirements
    console.log('\n📤 Test 6: Projecting requirements...');
    const projReqResult = await sendRequest('projection.requirements', {
      todo_id: taskId,
      specify_dir: './test-output/.specify'
    });
    console.log(`✅ Requirements projected:`, projReqResult);

    // Test 7: Project testcases
    console.log('\n📤 Test 7: Projecting testcases...');
    const projTcResult = await sendRequest('projection.testcases', {
      todo_id: taskId,
      specify_dir: './test-output/.specify'
    });
    console.log(`✅ Testcases projected:`, projTcResult);

    // Test 8: Project all
    console.log('\n📤 Test 8: Projecting all (TODO.md + .specify/**)...');
    const projAllResult = await sendRequest('projection.all', {
      output_dir: './test-output',
      specify_dir: './test-output/.specify'
    });
    console.log(`✅ All projected:`, {
      todo_md: projAllResult.todo_md,
      requirements_count: projAllResult.requirements.length,
      testcases_count: projAllResult.testcases.length
    });

    // Test 9: Export TODO.md and check for file links
    console.log('\n📄 Test 9: Exporting TODO.md and checking file links...');
    const exportResult = await sendRequest('exportTodoMd');
    const todoMdContent = exportResult.content;

    const hasRequirementsLink = todoMdContent.includes(`[Requirements](.specify/requirements/${taskId}.md)`);
    const hasTestCasesLink = todoMdContent.includes(`[TestCases](.specify/testcases/${taskId}.md)`);

    console.log(`✅ TODO.md exported:`);
    console.log(`   - Has Requirements link: ${hasRequirementsLink ? '✓' : '✗'}`);
    console.log(`   - Has TestCases link: ${hasTestCasesLink ? '✓' : '✗'}`);

    if (hasRequirementsLink && hasTestCasesLink) {
      console.log('\n🎉 All file links are present in TODO.md!');
    } else {
      console.log('\n⚠️  Some file links are missing in TODO.md');
    }

    console.log('\n🎉 All MCP tests passed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    ws.close();
  }
}

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

runTests();
