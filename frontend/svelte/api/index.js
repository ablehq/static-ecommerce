import axios from "axios";
import Cookies from "js-cookie";

class Api {
  constructor() {
    this.http = axios.create({
      baseURL: 'http://localhost:3000/api/v2/storefront'
    })
    this.http.interceptors.request.use(request => {
      console.log('Request:', request.url)
      return request
    }, error => {
      console.log('Request Error:', error)
    })

    this.http.interceptors.response.use(response => {
      console.log('Response:', response.config.url, response.status)
      return response
    }, error => {
      console.log('Response Error:', error)
    })
  }

  getOrderToken() {
    return Cookies.get("orderToken");
  }

  getHeaders() {
    const token = Cookies.get("orderToken");
    return ({
      headers: {
        "X-Spree-Order-Token": token
      }
    })
  }
}

class Cart extends Api {

  constructor() {
    super()
    this.endpoint = '/cart'
  }

  decorated(endpoint) {
    return `${endpoint}?include=line_items`
  }

  async fetch() {
    const token = this.getOrderToken();
    if (token) {
      return this.http.get(
        this.decorated(this.endpoint),
        this.getHeaders()
      ).then(resp => resp.data)
    } else {
      return this.post(this.decorated(this.endpoint))
        .then(response => {
          const orderToken = response.data.data.attributes.token;
          Cookies.set("orderToken", orderToken);
          return response.data;
        });
    }
  }

  async addItem(variant_id) {
    return this.http.post(
      this.decorated(`${this.endpoint}/add_item`),
      {
        variant_id,
        "quantity": 1
      },
      this.getHeaders()
    ).then(resp => resp.data)
  }

  async removeLineItem(line_item_id) {
    return this.http.delete(
      `${this.endpoint}/remove_line_item/${line_item_id}`,
      this.getHeaders()
    ).then(resp => resp.data)
  }

  async setQuantity(line_item_id, quantity) {
    console.log(line_item_id, quantity)
    return this.http.patch(
      this.decorated(`${this.endpoint}/set_quantity`),
      {
        line_item_id,
        quantity
      },
      this.getHeaders()
    ).then(resp => resp.data)
  }

  async empty(line_item_id, quantity) {
    return this.http.patch(
      this.decorated(`${this.endpoint}/empty`),
      {

      },
      this.getHeaders()
    ).then(resp => resp.data)
  }
}

export const cart = new Cart()

