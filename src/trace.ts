// This explains supported direct-argument formulas; all calculation remains in Univer.
export function splitArguments(formula: string): string[] {
  const body = formula.slice(formula.indexOf("(") + 1, -1);
  const args: string[] = [];
  let depth = 0,
    quoted = false,
    start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') quoted = !quoted;
    if (!quoted) {
      if (c === "(") depth++;
      if (c === ")") depth--;
      if (c === "," && depth === 0) {
        args.push(body.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  args.push(body.slice(start).trim());
  return args;
}
export function explainMatches(
  formula: string,
  read: (reference: string) => unknown[][],
): { row: number; included: boolean; value: unknown }[] {
  const name = /^=([A-Z]+)\(/i.exec(formula)?.[1].toUpperCase();
  if (!name || !["SUMIF", "SUMIFS", "COUNTIF", "COUNTIFS"].includes(name))
    return [];
  try {
    const a = splitArguments(formula);
    let sum: string | undefined,
      pairs: string[][] = [];
    if (name === "SUMIF") {
      sum = a[2] ?? a[0];
      pairs = [[a[0], a[1]]];
    } else if (name === "COUNTIF") {
      pairs = [[a[0], a[1]]];
    } else {
      const offset = name === "SUMIFS" ? 1 : 0;
      if (offset) sum = a[0];
      for (let i = offset; i < a.length; i += 2) pairs.push([a[i], a[i + 1]]);
    }
    if (pairs.some((p) => !/^"[^"*?<> =]*"$/.test(p[1]))) return [];
    const criteria = pairs.map(([range, value]) => ({
      data: read(range),
      value: value.slice(1, -1),
    }));
    const amounts = sum ? read(sum) : undefined;
    const firstRow = Number(/\$?(\d+)/.exec(pairs[0][0])?.[1] ?? 1);
    return criteria[0].data.map((_, i) => ({
      row: firstRow + i,
      included: criteria.every((c) => String(c.data[i]?.[0]) === c.value),
      value: amounts?.[i]?.[0] ?? 1,
    }));
  } catch {
    return [];
  }
}
