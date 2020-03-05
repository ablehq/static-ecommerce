module.exports = function(config) {
  config.setTemplateFormats(["css", "html", "js", "njk"]);
  config.addPassthroughCopy({ "source/images": "assets" });
  config.addWatchTarget("./source/*/*.pcss");
  config.addPassthroughCopy({
    "source/_includes/js/*": "assets/js"
  });
  return {
    dir: {
      input: "source",
      output: "dist",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data"
    }
  };
};
