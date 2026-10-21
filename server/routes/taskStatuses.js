// @ts-check

import i18next from "i18next";
import { ValidationError } from "objection";

export default (app) => {
  app
    .get("/statuses", { name: "statuses" }, async (_req, reply) => {
      const statuses = await app.objection.models.taskStatus.query();

      reply.render("taskStatuses/index", { statuses });
      return reply;
    })

    .get("/statuses/new", { name: "newStatus" }, (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const status = new app.objection.models.taskStatus();
      const header = i18next.t("views.statuses.new.header");

      reply.render("taskStatuses/new", { status, header });
      return reply;
    })

    .get("/statuses/:id/edit", { name: "editStatus" }, async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const status = await app.objection.models.taskStatus.query().findById(req.params.id);

      const header = i18next.t("views.statuses.edit.header");

      reply.render("taskStatuses/edit", { status, header });

      return reply;
    })

    .patch("/statuses/:id", { name: "status" }, async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const status = await app.objection.models.taskStatus.query().findById(req.params.id);

      try {
        const validStatus = app.objection.models.taskStatus.fromJson(req.body.data);

        await status.$query().patch(validStatus);

        req.flash("info", i18next.t("flash.statuses.update.success"));
        reply.redirect(app.reverse("statuses"));
      } catch (error) {
        if (!(error instanceof ValidationError)) {
          throw error;
        }

        const { data } = error;
        req.flash("error", i18next.t("flash.statuses.update.error"));

        status.$set(req.body.data);

        const header = i18next.t("views.statuses.edit.header");

        reply.render("taskStatuses/edit", {
          status,
          errors: data,
          header,
        });
      }

      return reply;
    })

    .delete("/statuses/:id", { name: "deleteStatus" }, async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const status = await app.objection.models.taskStatus.query().findById(req.params.id);

      const relatedTask = await app.objection.models.task
        .query()
        .findOne({ statusId: req.params.id });

      if (relatedTask) {
        req.flash("error", i18next.t("flash.statuses.delete.error"));
        reply.redirect(app.reverse("statuses"));
        return reply;
      }

      await status.$query().delete();

      req.flash("info", i18next.t("flash.statuses.delete.success"));
      reply.redirect(app.reverse("statuses"));

      return reply;
    })

    .post("/statuses", async (req, reply) => {
      if (!req.isAuthenticated()) {
        req.flash("error", i18next.t("flash.authError"));
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const status = new app.objection.models.taskStatus();
      status.$set(req.body.data);

      try {
        const validStatus = app.objection.models.taskStatus.fromJson(req.body.data);

        await app.objection.models.taskStatus.query().insert(validStatus);

        req.flash("info", i18next.t("flash.statuses.create.success"));
        reply.redirect(app.reverse("statuses"));
      } catch (error) {
        if (!(error instanceof ValidationError)) {
          throw error;
        }

        const { data } = error;
        req.flash("error", i18next.t("flash.statuses.create.error"));

        const header = i18next.t("views.statuses.new.header");

        reply.render("taskStatuses/new", {
          status,
          errors: data,
          header,
        });
      }

      return reply;
    });
};
