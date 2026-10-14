/**
 * The rules `scripts/validate-workflows.mts` holds `.github/workflows/` to, as a function of one file's text. Here
 * rather than in the script so the suite can import it, and beside `workflow-checks.test.mts`, which holds each rule to
 * a workflow it turns down.
 *
 * A workflow GitHub rejects at startup produces a failed run and no check run at all, so it cannot show up among a pull
 * request's checks: every one of them reads green beside a workflow that never started. This pass is what reads the
 * file before GitHub does. Each rule is one of GitHub's own requirements of the syntax, written out here rather than
 * inferred from the workflows in the repository — a rule learned from the files under test agrees with them by
 * construction, and would drift towards green as they change.
 */

import { isMap, isScalar, LineCounter, parseDocument, type Node } from 'yaml';

/** Every way `contents`, the workflow at `fileName`, falls short of what GitHub will start. */
export function workflowProblems(fileName: string, contents: string): string[] {
  const lineCounter = new LineCounter();
  const doc = parseDocument(contents, { lineCounter });

  const at = (node: Node | null | undefined) =>
    node?.range ? `${fileName}:${lineCounter.linePos(node.range[0]).line}` : fileName;

  if (doc.errors.length > 0) {
    return doc.errors.map((error) => `${fileName}:${error.linePos?.[0].line ?? 1}: ${error.message}`);
  }

  if (!isMap(doc.contents)) {
    return [`${fileName}: a workflow is a mapping of keys, and this is not one`];
  }

  const problems: string[] = [];

  // `on` is a string here, YAML 1.2 having dropped the 1.1 reading of it as `true`.
  if (!doc.contents.has('on')) {
    problems.push(`${at(doc.contents)}: no \`on\` — a workflow must name the events that run it`);
  }

  const jobs = doc.contents.get('jobs', true);

  if (!isMap(jobs) || jobs.items.length === 0) {
    problems.push(`${at(jobs ?? doc.contents)}: no \`jobs\` — a workflow must define at least one job`);
    return problems;
  }

  for (const { key, value } of jobs.items) {
    const name = isScalar(key) ? String(key.value) : String(key);

    if (!isMap(value)) {
      problems.push(`${at(key as Node)}: job "${name}" is not a mapping of keys`);
      continue;
    }

    /*
     * A job that calls a reusable workflow takes its runner from that workflow and may not name one, so `uses` stands
     * in for `runs-on` there. Nothing else does: a `container` runs inside the runner `runs-on` picks, not instead of
     * one, which is the job GitHub turned down on #179.
     */
    if (value.has('uses')) {
      if (value.has('runs-on')) {
        problems.push(`${at(key as Node)}: job "${name}" calls a reusable workflow, which may not set \`runs-on\``);
      }
    } else if (!value.has('runs-on')) {
      problems.push(`${at(key as Node)}: job "${name}" has no \`runs-on\` — every job must name its runner`);
    }
  }

  return problems;
}
