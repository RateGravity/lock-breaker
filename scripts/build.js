const esbuild = require("esbuild");

const isWatch = process.argv.includes("--watch");

async function build() {
  const buildOptions = {
    entryPoints: ["src/index.js"],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: "dist/index.js",
    sourcemap: true,
    // Minify for smaller bundle size
    minify: true,
    // Include legal comments for licenses
    legalComments: "linked",
    // Add banner for node shebang
    banner: {
      js: "#!/usr/bin/env node",
    },
    // Log build information
    logLevel: "info",
    metafile: true,
  };

  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log("👀 Watching for changes...");
    } else {
      await esbuild.build(buildOptions);
      console.log("✅ Build completed successfully");
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

build();
