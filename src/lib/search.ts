export type ParsedSearch = {
  text: string;
  literalText: string;
  literalSearchTerms: string[];
  normalizedText: string;
  searchTerms: string[];
  extensions: string[];
  itemType?: "file" | "folder";
  pathKeyword?: string;
};

export function normalizeSearchText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeLiteralSearchText(input: string) {
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function parseSearchQuery(input: string): ParsedSearch {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const textTokens: string[] = [];
  const extensions: string[] = [];
  let itemType: "file" | "folder" | undefined;
  let pathKeyword: string | undefined;

  for (const token of tokens) {
    const separatorIndex = token.indexOf(":");

    if (separatorIndex <= 0) {
      textTokens.push(token);
      continue;
    }

    const key = token.slice(0, separatorIndex).toLowerCase();
    const value = normalizeSearchText(token.slice(separatorIndex + 1));

    if (!value) {
      continue;
    }

    if (key === "ext") {
      extensions.push(value.replace(/^\./, ""));
      continue;
    }

    if (key === "type" && (value === "file" || value === "folder")) {
      itemType = value;
      continue;
    }

    if (key === "path") {
      pathKeyword = value;
      continue;
    }

    textTokens.push(token);
  }

  const text = textTokens.join(" ");
  const literalText = normalizeLiteralSearchText(text);
  const normalizedText = normalizeSearchText(text);

  return {
    text,
    literalText,
    literalSearchTerms: literalText.split(/\s+/).filter(Boolean),
    normalizedText,
    searchTerms: normalizedText.split(/\s+/).filter(Boolean),
    extensions,
    itemType,
    pathKeyword,
  };
}
