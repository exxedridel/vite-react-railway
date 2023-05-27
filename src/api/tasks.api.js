import axios from "axios";

/* api/tasks endpoint calls */
export const getTasksRequest = async () =>
  await axios.get(
    "https://mysql-restapi-production-5f4b.up.railway.app/api/tasks"
  );
