import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const SERVER_URL = 'ws://localhost:8765';
const AUTH_TOKEN = 'devtoken';

describe('TODO.md Issues Integration Tests', () => {
  let ws: WebSocket;
  let sessionId: string;
  let messageId = 0;

  beforeAll(async () => {
    // サーバーが起動していることを確認
    const testWs = new WebSocket(SERVER_URL);
    await new Promise((resolve, reject) => {
      testWs.on('open', () => {
        testWs.close();
        resolve(true);
      });
      testWs.on('error', reject);
    });
  });

  beforeEach(async () => {
    // 新しいWebSocket接続を作成
    ws = new WebSocket(SERVER_URL);
    
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // 認証
    const authResponse = await sendRequest({
      method: 'register',
      params: { authToken: AUTH_TOKEN }
    });
    
    sessionId = authResponse.result.session;
  });

  afterEach(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  afterAll(() => {
    // テストデータのクリーンアップ
    try {
      fs.rmSync('data', { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  function sendRequest(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      const message = { ...request, id, jsonrpc: '2.0' };
      
      ws.send(JSON.stringify(message));
      
      ws.once('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === id) {
            if (response.error) {
              reject(new Error(`API Error: ${response.error.message}`));
            } else {
              resolve(response);
            }
          }
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  describe('TODO.md Import/Export with Issues', () => {
    it('should import TODO.md with issues and export them correctly', async () => {
      const todoMd = `# Tasks

## [T-IMPORT-ISSUES-1] Import Issues Test

- [ ] Test task with issues
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Issues:

#### Issue 1: Database Performance
- **Status**: Open
- **Priority**: High
- **Category**: Performance
- **Severity**: High
- **Created**: 2025-01-16T09:00:00Z by reviewer1
- **Description**: Database queries are too slow
- **Tags**: performance, database

**Responses:**
- 2025-01-16T10:00:00Z by developer1: I'll optimize the queries
- 2025-01-16T11:00:00Z by reviewer1: Please add indexes
- 2025-01-16T12:00:00Z by developer1 (internal): Working on it

#### Issue 2: Code Style
- **Status**: Resolved
- **Priority**: Medium
- **Category**: Style
- **Severity**: Low
- **Created**: 2025-01-16T09:30:00Z by reviewer2
- **Resolved**: 2025-01-16T10:30:00Z by developer2
- **Description**: Inconsistent indentation
- **Tags**: style, formatting

**Responses:**
- 2025-01-16T09:45:00Z by developer2: Fixed the indentation
- 2025-01-16T10:30:00Z by reviewer2: Looks good, resolved

#### Issue 3: Security Vulnerability
- **Status**: Closed
- **Priority**: Critical
- **Category**: Security
- **Severity**: Critical
- **Created**: 2025-01-16T08:00:00Z by security-team
- **Resolved**: 2025-01-16T09:00:00Z by developer3
- **Closed**: 2025-01-16T09:15:00Z by security-team
- **Description**: SQL injection vulnerability found
- **Tags**: security, critical

**Responses:**
- 2025-01-16T08:15:00Z by developer3: Investigating the issue
- 2025-01-16T09:00:00Z by developer3: Fixed with parameterized queries
- 2025-01-16T09:15:00Z by security-team: Verified fix, closing issue
`;

      // TODO.mdをインポート
      const importResponse = await sendRequest({
        method: 'importTodoMd',
        params: {
          session: sessionId,
          content: todoMd
        }
      });

      expect(importResponse.result).toBeDefined();
      expect(importResponse.result.ok).toBe(true);

      // タスクが作成されたことを確認
      const taskResponse = await sendRequest({
        method: 'get_task',
        params: {
          session: sessionId,
          id: 'T-IMPORT-ISSUES-1'
        }
      });

      expect(taskResponse.result).toBeDefined();
      expect(taskResponse.result.id).toBe('T-IMPORT-ISSUES-1');

      // 指摘が作成されたことを確認
      const issuesResponse = await sendRequest({
        method: 'get_issues',
        params: {
          session: sessionId,
          task_id: 'T-IMPORT-ISSUES-1'
        }
      });

      expect(issuesResponse.result.issues.length).toBeGreaterThanOrEqual(3);

      // 特定の指摘を確認
      const performanceIssue = issuesResponse.result.issues.find((issue: any) => 
        issue.title === 'Database Performance'
      );
      expect(performanceIssue).toBeDefined();
      expect(performanceIssue.status).toBe('open');
      expect(performanceIssue.priority).toBe('high');
      expect(performanceIssue.category).toBe('performance');

      const styleIssue = issuesResponse.result.issues.find((issue: any) => 
        issue.title === 'Code Style'
      );
      expect(styleIssue).toBeDefined();
      expect(styleIssue.status).toBe('resolved');

      const securityIssue = issuesResponse.result.issues.find((issue: any) => 
        issue.title === 'Security Vulnerability'
      );
      expect(securityIssue).toBeDefined();
      expect(securityIssue.status).toBe('closed');

      // 指摘の応答を確認
      const performanceResponses = await sendRequest({
        method: 'get_issue_responses',
        params: {
          session: sessionId,
          issue_id: performanceIssue.id
        }
      });

      expect(performanceResponses.result.responses.length).toBeGreaterThanOrEqual(3);
      const internalResponse = performanceResponses.result.responses.find((r: any) => 
        r.is_internal === true
      );
      expect(internalResponse).toBeDefined();

      // TODO.mdをエクスポート
      const exportResponse = await sendRequest({
        method: 'exportTodoMd',
        params: {
          session: sessionId
        }
      });

      expect(exportResponse.result).toBeDefined();
      expect(exportResponse.result.content).toContain('T-IMPORT-ISSUES-1');
      expect(exportResponse.result.content).toContain('Database Performance');
      expect(exportResponse.result.content).toContain('Code Style');
      expect(exportResponse.result.content).toContain('Security Vulnerability');
      expect(exportResponse.result.content).toContain('Status: Open');
      expect(exportResponse.result.content).toContain('Status: Resolved');
      expect(exportResponse.result.content).toContain('Status: Closed');
      expect(exportResponse.result.content).toContain('Priority: High');
      expect(exportResponse.result.content).toContain('Category: Performance');
      expect(exportResponse.result.content).toContain('Category: Style');
      expect(exportResponse.result.content).toContain('Category: Security');
    });

    it('should handle issues with complex relationships', async () => {
      const todoMd = `# Tasks

## [T-COMPLEX-ISSUES-1] Complex Issues Test

- [ ] Task with complex issue relationships
- State: IN_PROGRESS

### Issues:

#### Issue 1: Main Issue
- **Status**: Open
- **Priority**: High
- **Category**: Bug
- **Severity**: High
- **Created**: 2025-01-16T09:00:00Z by reviewer1
- **Description**: Main issue description
- **Tags**: main, bug

**Responses:**
- 2025-01-16T10:00:00Z by developer1: Working on it
- 2025-01-16T11:00:00Z by reviewer1: Please provide more details

#### Issue 2: Related Issue
- **Status**: Open
- **Priority**: Medium
- **Category**: Enhancement
- **Severity**: Medium
- **Created**: 2025-01-16T09:30:00Z by reviewer2
- **Description**: Related enhancement
- **Tags**: enhancement, related

**Responses:**
- 2025-01-16T10:30:00Z by developer2: This is a good idea
- 2025-01-16T11:30:00Z by reviewer2: Let's discuss this further
`;

      // TODO.mdをインポート
      const importResponse = await sendRequest({
        method: 'importTodoMd',
        params: {
          session: sessionId,
          content: todoMd
        }
      });

      expect(importResponse.result.ok).toBe(true);

      // 指摘が作成されたことを確認
      const issuesResponse = await sendRequest({
        method: 'get_issues',
        params: {
          session: sessionId,
          task_id: 'T-COMPLEX-ISSUES-1'
        }
      });

      expect(issuesResponse.result.issues.length).toBeGreaterThanOrEqual(2);

      // 各指摘の応答を確認
      for (const issue of issuesResponse.result.issues) {
        const responses = await sendRequest({
          method: 'get_issue_responses',
          params: {
            session: sessionId,
            issue_id: issue.id
          }
        });

        expect(responses.result.responses.length).toBeGreaterThanOrEqual(2);
      }

      // TODO.mdをエクスポート
      const exportResponse = await sendRequest({
        method: 'exportTodoMd',
        params: {
          session: sessionId
        }
      });

      expect(exportResponse.result.content).toContain('T-COMPLEX-ISSUES-1');
      expect(exportResponse.result.content).toContain('Main Issue');
      expect(exportResponse.result.content).toContain('Related Issue');
    });

    it('should handle issues with special characters and formatting', async () => {
      const todoMd = `# Tasks

## [T-SPECIAL-ISSUES-1] Special Characters Test

- [ ] Task with special characters in issues
- State: IN_PROGRESS

### Issues:

#### Issue 1: Special Characters & Symbols
- **Status**: Open
- **Priority**: High
- **Category**: Bug
- **Severity**: High
- **Created**: 2025-01-16T09:00:00Z by reviewer1
- **Description**: Issue with special characters: <>&"' and unicode: 日本語
- **Tags**: special, unicode, symbols

**Responses:**
- 2025-01-16T10:00:00Z by developer1: Handling special chars: <>&"'
- 2025-01-16T11:00:00Z by reviewer1: Unicode test: 日本語文字
`;

      // TODO.mdをインポート
      const importResponse = await sendRequest({
        method: 'importTodoMd',
        params: {
          session: sessionId,
          content: todoMd
        }
      });

      expect(importResponse.result.ok).toBe(true);

      // 指摘が作成されたことを確認
      const issuesResponse = await sendRequest({
        method: 'get_issues',
        params: {
          session: sessionId,
          task_id: 'T-SPECIAL-ISSUES-1'
        }
      });

      expect(issuesResponse.result.issues.length).toBeGreaterThanOrEqual(1);

      const specialIssue = issuesResponse.result.issues.find((issue: any) => 
        issue.title === 'Special Characters & Symbols'
      );
      expect(specialIssue).toBeDefined();
      expect(specialIssue.description).toContain('special characters: <>&"\'');
      expect(specialIssue.description).toContain('unicode: 日本語');

      // 応答を確認
      const responses = await sendRequest({
        method: 'get_issue_responses',
        params: {
          session: sessionId,
          issue_id: specialIssue.id
        }
      });

      expect(responses.result.responses.length).toBeGreaterThanOrEqual(2);
      const response1 = responses.result.responses.find((r: any) => 
        r.content.includes('Handling special chars')
      );
      expect(response1).toBeDefined();
      expect(response1.content).toContain('<>&"\'');
      
      const response2 = responses.result.responses.find((r: any) => 
        r.content.includes('Unicode test')
      );
      expect(response2).toBeDefined();
      expect(response2.content).toContain('日本語文字');

      // TODO.mdをエクスポート
      const exportResponse = await sendRequest({
        method: 'exportTodoMd',
        params: {
          session: sessionId
        }
      });

      expect(exportResponse.result.content).toContain('T-SPECIAL-ISSUES-1');
      expect(exportResponse.result.content).toContain('Special Characters & Symbols');
      expect(exportResponse.result.content).toContain('special characters: <>&"\'');
      expect(exportResponse.result.content).toContain('unicode: 日本語');
    });
  });
});