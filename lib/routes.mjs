// Reguły _routes.json w Cloudflare Pages nie mogą na siebie nachodzić (błąd 8000057).

export function patternToRegExp(pattern) {
  const body = String(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${body}$`);
}

function samplesFor(pattern) {
  if (!pattern.includes("*")) return [pattern, pattern + "/"];
  const star = pattern.indexOf("*");
  const pre = pattern.slice(0, star);
  const post = pattern.slice(star + 1);
  return [pre + "a" + post, pre + "a/b" + post, pre + "sitemap.xml" + post, pre + post];
}

export function patternsOverlap(a, b) {
  const ra = patternToRegExp(a);
  const rb = patternToRegExp(b);
  return samplesFor(a).concat(samplesFor(b)).some((s) => ra.test(s) && rb.test(s));
}

export function routeConflicts(include = [], exclude = []) {
  const conflicts = [];
  for (let i = 0; i < include.length; i++) {
    for (let j = i + 1; j < include.length; j++) {
      if (patternsOverlap(include[i], include[j])) conflicts.push({ a: include[i], b: include[j], kind: "include" });
    }
  }
  for (const a of include) {
    for (const b of exclude) {
      if (patternsOverlap(a, b)) conflicts.push({ a, b, kind: "include-exclude" });
    }
  }
  return conflicts;
}
