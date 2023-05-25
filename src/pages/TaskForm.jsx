import { Form, Formik } from "formik";

function TaskForm() {
  return (
    <div>
      <Formik
        initialValues={{
          title: "",
          description: "",
        }}
        onSubmit={(values) => {
          console.log(values);
        }}
      >
        {({ handleChange, handleSubmit }) => (
          <Form onSubmit={handleSubmit}>
            <label htmlFor="title">Title</label>
            <input
              id="title"
              name="title"
              type="text"
              placeholder="Task title"
              onChange={handleChange}
            />

            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              rows="3"
              placeholder="Describe the task"
              onChange={handleChange}
            />

            <button type="submit">Save</button>
          </Form>
        )}
      </Formik>
    </div>
  );
}

export default TaskForm;
