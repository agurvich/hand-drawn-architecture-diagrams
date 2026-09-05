/**
 * The authoring guide's fence contract, in one place.
 *
 * A ```json block in `docs/ai-authoring-guide.md` is a WHOLE importable
 * document; every schema fragment uses ```ts instead. That rule exists because
 * "every JSON example in the guide" is not something a script can decide, and
 * the guide is handed to a model as ground truth -- so its examples are checked
 * rather than trusted.
 *
 * Lives here rather than in either test because BOTH lanes need it: vitest
 * proves the blocks parse, Playwright proves they import. A copy in each would
 * be two rules that agree until they don't.
 */
export function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```json\n([\s\S]*?)^```$/gm)].map((match) => match[1]!)
}
