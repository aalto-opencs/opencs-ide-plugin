import * as assert from 'assert';
import {
  renderHandoutMarkdown,
} from '../features/assignments/assignmentHandoutViewProvider';

suite('AssignmentHandoutViewProvider', () => {
  test('renders common Markdown while escaping raw HTML', () => {
    const html = renderHandoutMarkdown([
      '# Hello world',
      '',
      '**Implement** the exercise.',
      '',
      '<script>alert("unsafe")</script>',
    ].join('\n'));

    assert.match(html, /<h1>Hello world<\/h1>/);
    assert.match(html, /<strong>Implement<\/strong>/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  test('blocks unsafe images and resolves safe local images', () => {
    const html = renderHandoutMarkdown(
      [
        '![Local diagram](images/diagram.png)',
        '![Unsafe diagram](javascript:alert(1))',
      ].join('\n'),
      (source) => source === 'images/diagram.png'
        ? 'vscode-webview://safe/images/diagram.png'
        : undefined,
    );

    assert.match(html, /src="vscode-webview:\/\/safe\/images\/diagram\.png"/);
    assert.doesNotMatch(html, /src="javascript:/);
  });

  test('opens external links without giving them opener access', () => {
    const html = renderHandoutMarkdown(
      '[Platform](https://example.com/assignment)',
    );

    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
  });
});
