const fs = require("fs");
const path = require("path");
const postcss = require("postcss");
const purgecss = require("@fullhuman/postcss-purgecss");

module.exports = class {
  async data() {
    const rawFilepath = path.join(__dirname, "./application.pcss");
    const rawCss = await fs.readFileSync(rawFilepath);

    return {
      permalink: "assets/application.css",
      rawFilepath,
      rawCss
    };
  }

  async render({ rawCss, rawFilepath }) {
    return await postcss([
      require("postcss-import"),
      require("tailwindcss")("./tailwind.config.js"),
      require("postcss-nested"),
      purgecss({
        content: [
          "./source/**/*.html",
          "./source/**/*.njk",
          "./source/**/*.md",
          "./source/**/*.liquid"
        ],
        whitelist: [
          "h1",
          "h2",
          "h3",
          "h4",
          "p",
          "ul",
          "ol",
          "li",
          "a",
          "pre",
          "table",
          "tr",
          "td",
          "th",
          "tbody",
          "thead",
          "blockquote",
          "dl",
          "dt",
          "dd"
        ],
        defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
      }),
      require("cssnano")
    ])
      .process(rawCss, { from: rawFilepath })
      .then(result => result);
  }
};
