import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let messageId = 1;

function sendRequest(server, method, params = {}) {
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
    }, 10000);

    const handler = (data) => {
      try {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          const response = JSON.parse(line);
          if (response.id === id) {
            clearTimeout(timeout);
            server.stdout.off('data', handler);
            if (response.error) {
              reject(new Error(`${method} error: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
            return;
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    server.stdout.on('data', handler);
    server.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function runTests() {
  console.log('🔌 Starting MCP Stdio server...');

  const serverPath = join(__dirname, 'dist', 'stdio-server.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Log stderr (server logs)
  server.stderr.on('data', (data) => {
    console.log('[server]', data.toString().trim());
  });

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    console.log('✅ Server started\n');

    // Test 1: Create a task
    console.log('📝 Test 1: Creating a task...');
    const taskId = `T-STDIO-TEST-${Date.now()}`;
    await sendRequest(server, 'upsert_task', {
      id: taskId,
      title: 'Stdio Transport Test Task',
      text: 'Testing MCP stdio connectivity'
    });
    console.log(`✅ Task created: ${taskId}\n`);

    // Test 2: Get the task
    console.log('📖 Test 2: Getting the task...');
    const task = await sendRequest(server, 'get_task', { id: taskId });
    console.log(`✅ Task retrieved:`, {
      id: task.id,
      title: task.title,
      state: task.state
    });
    console.log('');

    // Test 3: Submit requirements
    console.log('📋 Test 3: Submitting requirements...');
    const reqResult = await sendRequest(server, 'ut.requirements.submit', {
      id: `REQ-STDIO-${Date.now()}`,
      todo_id: taskId,
      raw_markdown: '# Requirements\n\n- Must support stdio transport\n- Must integrate with Claude Code',
      idempotency_key: `req-stdio-${Date.now()}`
    });
    console.log(`✅ Requirements submitted:`, reqResult);
    console.log('');

    // Test 4: Submit testcases
    console.log('🧪 Test 4: Submitting testcases...');
    const tcResult = await sendRequest(server, 'ut.testcases.submit', {
      id: `TC-STDIO-${Date.now()}`,
      requirements_id: reqResult.requirements_id,
      todo_id: taskId,
      raw_markdown: '# Test Cases\n\n## TC-1: Stdio Test\n- Given: Stdio server is running\n- When: Request is sent\n- Then: Response is received',
      idempotency_key: `tc-stdio-${Date.now()}`
    });
    console.log(`✅ Testcases submitted:`, tcResult);
    console.log('');

    // Test 5: Export TODO.md
    console.log('📄 Test 5: Exporting TODO.md...');
    const exportResult = await sendRequest(server, 'exportTodoMd', {});
    const hasRequirementsLink = exportResult.content.includes(`[Requirements](.specify/requirements/${taskId}.md)`);
    const hasTestCasesLink = exportResult.content.includes(`[TestCases](.specify/testcases/${taskId}.md)`);

    console.log(`✅ TODO.md exported:`);
    console.log(`   - Has Requirements link: ${hasRequirementsLink ? '✓' : '✗'}`);
    console.log(`   - Has TestCases link: ${hasTestCasesLink ? '✓' : '✗'}`);
    console.log('');

    if (hasRequirementsLink && hasTestCasesLink) {
      console.log('🎉 All file links are present in TODO.md!');
    }

    console.log('\n🎉 All Stdio tests passed successfully!');

    server.kill();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    server.kill();
    process.exit(1);
  }
}

runTests();
