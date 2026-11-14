process.env.PATH = ["/opt/homebrew/bin", process.env.PATH].filter(Boolean).join(":");
process.env.KRONTERM_DATA_HOME ??= "/Users/albsheralsadi/Library/Application Support/kronterm-dev";
process.env.KRONTERM_CONFIG_HOME ??= "/Users/albsheralsadi/.config/kronterm-dev";
await import("./dist/main/index.js");
