export type ParsedSearch = {
  text: string;
  normalizedText: string;
  extensions: string[];
  itemType?: "file" | "folder";
  pathKeyword?: string;
};

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
    const value = token.slice(separatorIndex + 1).trim().toLowerCase();

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

  return {
    text,
    normalizedText: text.toLowerCase(),
    extensions,
    itemType,
    pathKeyword,
  };
}
