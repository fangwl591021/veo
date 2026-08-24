import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBlogPost, normalizeBlogSlug } from "../src/blog.js";

test("blog slug keeps Chinese and normalizes separators", () => {
  assert.equal(normalizeBlogSlug(" A-KAFFIT 最新 消息 "), "a-kaffit-最新-消息");
});

test("blog post defaults to draft and clamps sort order", () => {
  const post = normalizeBlogPost({
    title: "每日簽到指南",
    status: "unknown",
    sortOrder: 99999,
  });
  assert.equal(post.slug, "每日簽到指南");
  assert.equal(post.status, "draft");
  assert.equal(post.sortOrder, 9999);
});

test("blog post requires a title", () => {
  assert.throws(() => normalizeBlogPost({ title: " " }), /文章標題為必填/);
});
