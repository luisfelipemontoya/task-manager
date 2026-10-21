// @ts-check

import i18next from "i18next";
import { ValidationError } from "objection";

export default (app) => {
  app
    .get("/users", { name: "users" }, async (_req, reply) => {
      const users = await app.objection.models.user.query();
      reply.render("users/index", { users });
      return reply;
    })
    .get("/users/new", { name: "newUser" }, (_req, reply) => {
      const user = new app.objection.models.user();
      const header = i18next.t("views.users.new.signUp");

      reply.render("users/new", { user, header });
    })
    .get("/users/:id/edit", { name: "editUser" }, async (req, reply) => {
      if (!req.isAuthenticated()) {
        reply.redirect(app.reverse("root"));
        return reply;
      }

      if (req.user.id !== Number(req.params.id)) {
        req.flash("error", i18next.t("flash.usersUnauthorized"));
        reply.redirect(app.reverse("users"));
        return reply;
      }

      const user = await app.objection.models.user.query().findById(req.params.id);
      const header = i18next.t("views.users.edit.edit");

      reply.render("users/edit", { user, header });
      return reply;
    })
    .patch("/users/:id", { name: "user" }, async (req, reply) => {
      if (!req.isAuthenticated()) {
        reply.redirect(app.reverse("root"));
        return reply;
      }

      if (req.user.id !== Number(req.params.id)) {
        req.flash("error", i18next.t("flash.usersUnauthorized"));
        reply.redirect(app.reverse("users"));
        return reply;
      }

      const user = await app.objection.models.user.query().findById(req.params.id);

      try {
        const validUser = await app.objection.models.user.fromJson(req.body.data);

        await user.$query().patch(validUser);

        req.flash("info", i18next.t("flash.users.update.success"));
        reply.redirect(app.reverse("users"));
      } catch (error) {
        if (!(error instanceof ValidationError)) {
          throw error;
        }

        const { data } = error;
        req.flash("error", i18next.t("flash.users.update.error"));

        const header = i18next.t("views.users.edit.edit");

        user.$set(req.body.data);

        reply.render("users/edit", {
          user,
          errors: data,
          header,
        });
      }
      return reply;
    })

    .delete("/users/:id", { name: "deleteUser" }, async (req, reply) => {
      if (!req.isAuthenticated() || req.user.id !== Number(req.params.id)) {
        reply.redirect(app.reverse("root"));
        return reply;
      }

      const user = await app.objection.models.user.query().findById(req.params.id);

      const relatedTask = await app.objection.models.task
        .query()
        .where("creatorId", req.params.id)
        .orWhere("executorId", req.params.id)
        .first();

      if (relatedTask) {
        req.flash("error", i18next.t("flash.users.delete.error"));
        reply.redirect(app.reverse("users"));
        return reply;
      }

      await user.$query().delete();

      req.logOut();
      req.flash("info", i18next.t("flash.users.delete.success"));

      reply.redirect(app.reverse("users"));
      return reply;
    })

    .post("/users", async (req, reply) => {
      const user = new app.objection.models.user();
      user.$set(req.body.data);

      try {
        const validUser = await app.objection.models.user.fromJson(req.body.data);
        await app.objection.models.user.query().insert(validUser);
        req.flash("info", i18next.t("flash.users.create.success"));
        reply.redirect(app.reverse("root"));
      } catch (error) {
        if (!(error instanceof ValidationError)) {
          throw error;
        }

        const { data } = error;
        req.flash("error", i18next.t("flash.users.create.error"));

        const header = i18next.t("views.users.new.signUp");

        reply.render("users/new", {
          user,
          errors: data,
          header,
        });
      }

      return reply;
    });
};
