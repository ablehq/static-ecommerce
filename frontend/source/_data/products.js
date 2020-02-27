const fetch = require("node-fetch");

module.exports = function() {
  return fetch("http://localhost:3000/api/v2/storefront/products")
    .then(response => {
      return response.json();
    })
    .then(json => json.data);
};
