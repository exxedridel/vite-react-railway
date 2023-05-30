import axios from "axios";

// Pointing to my current node.js back-end with MySQL,
 // but gonna create a new one with MongoDB
export default axios.create({
  baseURL: "http://localhost:4000",
});
