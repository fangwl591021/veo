const BLOG_CATEGORIES = [
  "最新消息",
  "品牌故事",
  "商務知識",
  "活動紀錄",
  "會員指南",
  "精選專題",
];

const text = (value, max) => String(value ?? "").trim().slice(0, max);

export function normalizeBlogSlug(value, fallback = "") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return normalized || `post-${Date.now()}`;
}

export function normalizeBlogPost(input = {}) {
  const title = text(input.title, 120);
  if (!title) throw new Error("文章標題為必填");
  const status = input.status === "published" ? "published" : "draft";
  return {
    title,
    slug: normalizeBlogSlug(input.slug, title),
    excerpt: text(input.excerpt, 320),
    content: text(input.content, 20000),
    coverImageUrl: text(input.coverImageUrl, 1000),
    category: text(input.category, 40) || "最新消息",
    status,
    sortOrder: Math.max(-9999, Math.min(9999, Number(input.sortOrder) || 0)),
  };
}

const mapPost = (row) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt || "",
  content: row.content || "",
  coverImageUrl: row.cover_image_url || "",
  category: row.category || "最新消息",
  status: row.status,
  sortOrder: Number(row.sort_order) || 0,
  publishedAt: row.published_at || "",
  createdAt: row.created_at || "",
  updatedAt: row.updated_at || "",
});

export async function listPublishedBlogPosts(db, { category = "", limit = 12 } = {}) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 12));
  const selectedCategory = text(category, 40);
  const query = selectedCategory
    ? db.prepare(`SELECT * FROM blog_posts WHERE status='published' AND category=?
        ORDER BY sort_order DESC, published_at DESC, created_at DESC LIMIT ?`).bind(selectedCategory, safeLimit)
    : db.prepare(`SELECT * FROM blog_posts WHERE status='published'
        ORDER BY sort_order DESC, published_at DESC, created_at DESC LIMIT ?`).bind(safeLimit);
  const rows = await query.all();
  return { posts: (rows.results || []).map(mapPost), categories: BLOG_CATEGORIES };
}

export async function getPublishedBlogPost(db, slug) {
  const row = await db.prepare(
    "SELECT * FROM blog_posts WHERE status='published' AND slug=? LIMIT 1",
  ).bind(String(slug || "")).first();
  return row ? mapPost(row) : null;
}

export async function listAdminBlogPosts(db) {
  const rows = await db.prepare(
    "SELECT * FROM blog_posts ORDER BY sort_order DESC, updated_at DESC",
  ).all();
  return { posts: (rows.results || []).map(mapPost), categories: BLOG_CATEGORIES };
}

export async function createBlogPost(db, actorUserId, input) {
  const post = normalizeBlogPost(input);
  const id = `blog_${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO blog_posts
    (id,slug,title,excerpt,content,cover_image_url,category,status,sort_order,published_at,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END,?)`)
    .bind(id, post.slug, post.title, post.excerpt, post.content, post.coverImageUrl,
      post.category, post.status, post.sortOrder, post.status, actorUserId).run();
  return { ...post, id };
}

export async function updateBlogPost(db, id, input) {
  const post = normalizeBlogPost(input);
  const result = await db.prepare(`UPDATE blog_posts SET
    slug=?,title=?,excerpt=?,content=?,cover_image_url=?,category=?,status=?,sort_order=?,
    published_at=CASE WHEN ?='published' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE NULL END,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(post.slug, post.title, post.excerpt, post.content, post.coverImageUrl,
      post.category, post.status, post.sortOrder, post.status, id).run();
  if (!result.meta?.changes) throw new Error("找不到這篇文章");
  return { ...post, id };
}

export async function deleteBlogPost(db, id) {
  const result = await db.prepare("DELETE FROM blog_posts WHERE id=?").bind(id).run();
  if (!result.meta?.changes) throw new Error("找不到這篇文章");
  return { success: true };
}
