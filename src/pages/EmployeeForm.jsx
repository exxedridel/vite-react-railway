import { Form, Formik } from "formik";
import { createEmployeeRequest } from "../api/tasks.api";

function EmployeeForm() {
  return (
    <div>
      <Formik
        initialValues={{
          name: "",
          salary: "",
        }}
        onSubmit={async (values, actions) => {
          console.log(values);
          try {
            const response = await createEmployeeRequest(values);
            console.log(response);
            actions.resetForm();
          } catch (error) {
            console.error(error);
          }
        }}
      >
        {({ handleChange, handleSubmit, values, isSubmitting }) => (
          <Form onSubmit={handleSubmit}>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Employee name"
              onChange={handleChange}
              value={values.name}
            />

            <label htmlFor="salary">Salary</label>
            <input
              id="salary"
              name="salary"
              type="number"
              placeholder="Amount"
              onChange={handleChange}
              value={values.salary}
            />

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </Form>
        )}
      </Formik>
    </div>
  );
}

export default EmployeeForm;
