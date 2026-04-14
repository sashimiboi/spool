import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki';

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  // Web
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  mjs: 'javascript', mts: 'typescript', cjs: 'javascript', cts: 'typescript',
  css: 'css', scss: 'scss', less: 'less', sass: 'sass',
  html: 'html', htm: 'html', svg: 'xml', xml: 'xml',
  json: 'json', jsonc: 'jsonc', json5: 'json5',
  graphql: 'graphql', gql: 'graphql',
  svelte: 'svelte', vue: 'vue', astro: 'astro',

  // Systems
  py: 'python', pyi: 'python', pyw: 'python',
  rs: 'rust', go: 'go', c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  cs: 'csharp', java: 'java', kt: 'kotlin', kts: 'kotlin',
  swift: 'swift', m: 'objective-c', mm: 'objective-c',
  zig: 'zig',

  // Scripting
  rb: 'ruby', php: 'php', pl: 'perl', pm: 'perl',
  lua: 'lua', r: 'r', R: 'r',
  ex: 'elixir', exs: 'elixir', erl: 'erlang',
  clj: 'clojure', cljs: 'clojure', cljc: 'clojure',
  scala: 'scala', groovy: 'groovy',
  dart: 'dart', nim: 'nim', jl: 'julia',
  hs: 'haskell', ml: 'ocaml', mli: 'ocaml', fs: 'fsharp', fsx: 'fsharp',

  // Shell / Config
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish',
  ps1: 'powershell', psm1: 'powershell',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini', env: 'ini',
  tf: 'hcl', hcl: 'hcl',
  dockerfile: 'dockerfile', containerfile: 'dockerfile',

  // Data / Markup
  md: 'markdown', mdx: 'mdx', rst: 'rst',
  sql: 'sql', prisma: 'prisma', proto: 'proto',
  tex: 'latex', latex: 'latex',
  csv: 'csv', tsv: 'csv',

  // Config files
  makefile: 'makefile', cmake: 'cmake',
  nginx: 'nginx', conf: 'nginx',
  diff: 'diff', patch: 'diff',
  wasm: 'wasm', wat: 'wasm',
};

const SUPPORTED_LANGS = Array.from(new Set(Object.values(EXT_TO_LANG)));

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: SUPPORTED_LANGS,
    });
  }
  return highlighterPromise;
}

const FILENAME_TO_LANG: Record<string, BundledLanguage> = {
  dockerfile: 'dockerfile', containerfile: 'dockerfile',
  makefile: 'makefile', gnumakefile: 'makefile',
  cmakelists: 'cmake',
  gemfile: 'ruby', rakefile: 'ruby',
  justfile: 'just',
};

export function getLangFromPath(filePath: string): BundledLanguage | null {
  const basename = filePath.split('/').pop()?.toLowerCase() || '';
  const nameLang = FILENAME_TO_LANG[basename.split('.')[0]];
  if (nameLang) return nameLang;
  const ext = basename.includes('.') ? basename.split('.').pop()! : '';
  return ext ? EXT_TO_LANG[ext] || null : null;
}

export interface HighlightedLine {
  tokens: Array<{ content: string; color?: string }>;
}

export async function highlightLines(
  lines: string[],
  lang: BundledLanguage | null,
): Promise<HighlightedLine[]> {
  if (!lang || lines.length === 0) {
    return lines.map(l => ({ tokens: [{ content: l }] }));
  }

  const h = await getHighlighter();
  const code = lines.join('\n');

  try {
    const result = h.codeToTokens(code, { lang, theme: 'github-dark' });
    return result.tokens.map(lineTokens => ({
      tokens: lineTokens.map(t => ({ content: t.content, color: t.color })),
    }));
  } catch {
    return lines.map(l => ({ tokens: [{ content: l }] }));
  }
}
