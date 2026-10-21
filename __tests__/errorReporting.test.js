// @ts-check

import { jest } from "@jest/globals";
import fastify from "fastify";
import init from "../server/plugin.js";
import { getTestData, prepareData } from "./helpers/index.js";

describe("unexpected form errors", () => {
  let app;
  let models;
  let cookies;
  let reportedErrors;

  beforeAll(async () => {
    app = fastify({ exposeHeadRoutes: false });
    reportedErrors = [];
    app.addHook("onError", async (_req, _reply, error) => {
      reportedErrors.push(error);
    });
    await init(app);
    models = app.objection.models;
    await app.objection.knex.migrate.latest();
    await prepareData(app);
    const response = await app.inject({
      method: "POST",
      url: app.reverse("session"),
      payload: { data: getTestData().users.existing },
    });
    const [cookie] = response.cookies;
    cookies = { [cookie.name]: cookie.value };
  });

  it.each([
    ["user", "/users"],
    ["label", "/labels"],
    ["taskStatus", "/statuses"],
    ["task", "/tasks"],
  ])("propagates unexpected errors from %s creation and editing", async (model, url) => {
    const user = await models.user.query().findOne({ email: getTestData().users.existing.email });
    const status = await models.taskStatus.query().first();
    const record =
      model === "task"
        ? await models.task
            .query()
            .insert({ name: "Error reporting task", creatorId: user.id, statusId: status.id })
        : model === "user"
          ? user
          : await models[model].query().first();

    const error = new Error("Unexpected database failure");
    const spy = jest.spyOn(models[model], "fromJson").mockImplementation(() => {
      throw error;
    });
    // Task updates validate through the instance query rather than fromJson.
    const querySpy =
      model === "task"
        ? jest.spyOn(models.task.prototype, "$query").mockImplementation(() => {
            throw error;
          })
        : null;
    try {
      for (const method of ["POST", "PATCH"]) {
        const response = await app.inject({
          method,
          url: method === "POST" ? url : `${url}/${record.id}`,
          cookies,
          payload: { data: { name: "Updated name", statusId: status.id } },
        });
        expect(response.statusCode).toBe(500);
        expect(reportedErrors.at(-1)).toBe(error);
      }
    } finally {
      spy.mockRestore();
      querySpy?.mockRestore();
    }
  });

  afterAll(async () => {
    await app.close();
  });
});
