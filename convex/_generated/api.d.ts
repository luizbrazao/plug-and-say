/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as agentTemplates from "../agentTemplates.js";
import type * as agents from "../agents.js";
import type * as agents_reader from "../agents_reader.js";
import type * as auth from "../auth.js";
import type * as authRepairs from "../authRepairs.js";
import type * as brain from "../brain.js";
import type * as crons from "../crons.js";
import type * as departments from "../departments.js";
import type * as documents from "../documents.js";
import type * as executors from "../executors.js";
import type * as http from "../http.js";
import type * as http_gmail from "../http_gmail.js";
import type * as integrations from "../integrations.js";
import type * as integrations_gmail from "../integrations_gmail.js";
import type * as invites from "../invites.js";
import type * as knowledge from "../knowledge.js";
import type * as knowledgeNode from "../knowledgeNode.js";
import type * as lib_deptContext from "../lib/deptContext.js";
import type * as lib_orgAuthorization from "../lib/orgAuthorization.js";
import type * as memory from "../memory.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as openai from "../openai.js";
import type * as organizations from "../organizations.js";
import type * as planLimits from "../planLimits.js";
import type * as plans from "../plans.js";
import type * as reviews from "../reviews.js";
import type * as stripe from "../stripe.js";
import type * as tasks from "../tasks.js";
import type * as telegram from "../telegram.js";
import type * as thread_subscriptions from "../thread_subscriptions.js";
import type * as thread_subscriptions_notify from "../thread_subscriptions_notify.js";
import type * as tools_delegation from "../tools/delegation.js";
import type * as tools_email from "../tools/email.js";
import type * as tools_github from "../tools/github.js";
import type * as tools_gmailApi from "../tools/gmailApi.js";
import type * as tools_gmailClient from "../tools/gmailClient.js";
import type * as tools_gmailOAuth from "../tools/gmailOAuth.js";
import type * as tools_gmailTools from "../tools/gmailTools.js";
import type * as tools_image from "../tools/image.js";
import type * as tools_knowledge from "../tools/knowledge.js";
import type * as tools_notion from "../tools/notion.js";
import type * as tools_search from "../tools/search.js";
import type * as tools_social from "../tools/social.js";
import type * as uprising from "../uprising.js";
import type * as uxEvents from "../uxEvents.js";
import type * as uxFlows from "../uxFlows.js";
import type * as uxPing from "../uxPing.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  agentTemplates: typeof agentTemplates;
  agents: typeof agents;
  agents_reader: typeof agents_reader;
  auth: typeof auth;
  authRepairs: typeof authRepairs;
  brain: typeof brain;
  crons: typeof crons;
  departments: typeof departments;
  documents: typeof documents;
  executors: typeof executors;
  http: typeof http;
  http_gmail: typeof http_gmail;
  integrations: typeof integrations;
  integrations_gmail: typeof integrations_gmail;
  invites: typeof invites;
  knowledge: typeof knowledge;
  knowledgeNode: typeof knowledgeNode;
  "lib/deptContext": typeof lib_deptContext;
  "lib/orgAuthorization": typeof lib_orgAuthorization;
  memory: typeof memory;
  messages: typeof messages;
  migrations: typeof migrations;
  notifications: typeof notifications;
  openai: typeof openai;
  organizations: typeof organizations;
  planLimits: typeof planLimits;
  plans: typeof plans;
  reviews: typeof reviews;
  stripe: typeof stripe;
  tasks: typeof tasks;
  telegram: typeof telegram;
  thread_subscriptions: typeof thread_subscriptions;
  thread_subscriptions_notify: typeof thread_subscriptions_notify;
  "tools/delegation": typeof tools_delegation;
  "tools/email": typeof tools_email;
  "tools/github": typeof tools_github;
  "tools/gmailApi": typeof tools_gmailApi;
  "tools/gmailClient": typeof tools_gmailClient;
  "tools/gmailOAuth": typeof tools_gmailOAuth;
  "tools/gmailTools": typeof tools_gmailTools;
  "tools/image": typeof tools_image;
  "tools/knowledge": typeof tools_knowledge;
  "tools/notion": typeof tools_notion;
  "tools/search": typeof tools_search;
  "tools/social": typeof tools_social;
  uprising: typeof uprising;
  uxEvents: typeof uxEvents;
  uxFlows: typeof uxFlows;
  uxPing: typeof uxPing;
  viewer: typeof viewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
