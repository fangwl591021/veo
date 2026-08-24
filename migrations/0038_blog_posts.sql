CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '最新消息',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES platform_users(id)
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_public
  ON blog_posts(status, published_at DESC, sort_order DESC);

UPDATE point_rules
SET points = CASE WHEN points > 0 THEN points ELSE 1 END,
    award_frequency = 'daily',
    status = 'active',
    updated_at = CURRENT_TIMESTAMP
WHERE program_id = 'program_main'
  AND event_type = 'daily_ad_checkin';

INSERT OR IGNORE INTO blog_posts
  (id, slug, title, excerpt, content, category, status, sort_order, published_at)
VALUES
  (
    'blog_welcome',
    'welcome-to-akaffit-team',
    '歡迎加入 A-KAFFIT TEAM',
    '從商務交流、會員活動到人脈經營，掌握團隊的最新消息。',
    'A-KAFFIT TEAM 將商務交流、會員活動與人脈經營整合在同一個會員入口。你可以在這裡查看最新公告、完成每日簽到，也能持續累積與運用商脈點數。',
    '品牌故事',
    'published',
    30,
    CURRENT_TIMESTAMP
  ),
  (
    'blog_networking',
    'build-better-business-connections',
    '讓每一次交流都成為長期商脈',
    '收藏名片、整理聯絡資訊，並用一致的方式延續每一次認識。',
    '商脈不是聯絡人數量，而是持續互動所累積的信任。從交換名片後的整理、標記與回訪開始，讓每一次交流都有下一步。',
    '精選專題',
    'published',
    20,
    CURRENT_TIMESTAMP
  ),
  (
    'blog_daily',
    'daily-checkin-guide',
    '每日簽到與商脈點數說明',
    '完成指定內容後即可簽到；點數會依後台啟用中的規則入帳。',
    '進入會員首頁的「每日簽到」，依序完成當日指定內容，再按下簽到按鈕。相同活動與日期只會入帳一次，已完成時可再次開啟確認狀態。',
    '會員指南',
    'published',
    10,
    CURRENT_TIMESTAMP
  );

