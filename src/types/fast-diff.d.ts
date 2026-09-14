declare module 'fast-diff' {
  type DiffOperation = -1 | 0 | 1;
  type DiffTuple = [DiffOperation, string];

  function diff(text1: string, text2: string): DiffTuple[];

  export = diff;
}
