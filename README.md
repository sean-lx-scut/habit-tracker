# 微习惯

一个使用原生 HTML、CSS、JavaScript 和 Supabase 构建的习惯打卡网页。无需安装 Node.js、无需构建命令，可直接发布到 GitHub Pages。

## 已实现功能

- 匿名账户自动登录，无注册和登录界面。
- 添加、编辑和删除每日习惯。
- 今日打卡、历史日期补打卡和撤销打卡。
- 当前连续天数、历史最长连续天数。
- 最近 7 天完成趋势、最近 30 天热力图和各习惯完成率。
- 60 条内置中文每日名言，按本地日期稳定轮换。
- 手机、平板和桌面响应式布局。
- Supabase Row Level Security，匿名用户之间数据隔离。

## 项目文件

```text
.
├── index.html              # 页面与弹窗结构
├── styles.css              # 完整界面样式
├── config.js               # Supabase 公开配置
├── js/
│   ├── app.js              # 页面渲染与交互
│   ├── date-utils.js       # 本地日期工具
│   ├── quotes.js           # 每日名言库
│   ├── stats.js            # Streak 与统计计算
│   └── supabase-service.js # 云数据库访问层
├── supabase/
│   └── schema.sql          # 数据表、索引和 RLS 策略
├── tests/
│   ├── unit-tests.html     # 日期、Streak、统计和名言测试
│   └── layout-tests.html   # 移动端横向溢出检查
└── .nojekyll               # GitHub Pages 静态资源支持
```

## 一、创建 Supabase 项目

1. 打开 [Supabase](https://supabase.com/dashboard) 并注册账号。
2. 点击 **New project**，填写项目名称和数据库密码。数据库密码只由你保管，不要写进前端代码。
3. Region 优先选择 **Southeast Asia (Singapore)**。
4. 等待项目初始化完成。

## 二、启用匿名登录

1. 打开项目的 **Authentication**。
2. 进入 **Providers**（部分界面显示为 **Sign In / Providers** 或 **User Sign-Ins**）。
3. 找到 **Anonymous Sign-Ins**，启用并保存。

本项目使用 Supabase 的匿名 Auth 用户，而不是“公开 anon key 直接访问所有数据”。每个浏览器会获得独立的匿名用户身份。

## 三、初始化数据库

1. 在 Supabase 左侧进入 **SQL Editor**。
2. 新建查询。
3. 完整复制本仓库 [supabase/schema.sql](./supabase/schema.sql) 的内容。
4. 点击 **Run**，确认执行成功。

脚本会创建：

- `habits`：习惯定义。
- `check_ins`：每日打卡记录。
- 联合唯一约束，防止同一习惯同一天重复打卡。
- 删除习惯时级联删除对应打卡记录。
- 行级安全策略，只允许当前匿名用户访问自己的数据。

## 四、获取公开 API 配置

1. 打开 **Project Settings**。
2. 进入 **API Keys** 或 **Data API**。
3. 复制 **Project URL**，例如 `https://abcdefghijk.supabase.co`。
4. 复制 **Publishable key**。如果项目仍显示旧版密钥，可复制 **anon public** key。

打开根目录的 `config.js`，替换两个占位值：

```js
export const APP_CONFIG = Object.freeze({
  supabaseUrl: "https://你的项目编号.supabase.co",
  supabasePublishableKey: "你的 Publishable 或 anon key",
});
```

公开前端只能使用 Publishable/anon key。**绝不要**把 `service_role`、`secret`、数据库密码或 Secret key 写进 `config.js`。

## 五、发布到 GitHub Pages

1. 在 GitHub 创建一个公开仓库，例如 `micro-habits`。
2. 通过网页上传本目录中的全部文件，同时保留目录结构。
3. 提交到 `main` 分支。
4. 打开仓库 **Settings → Pages**。
5. 在 **Build and deployment** 中选择 **Deploy from a branch**。
6. 分支选择 `main`，目录选择 `/ (root)`，保存。
7. 等待 GitHub 生成 `https://你的用户名.github.io/仓库名/`。

项目使用 Hash 路由（`#today`、`#stats`）和相对资源路径，因此部署在子目录或刷新页面时不会出现 404。

如需在本地预览，建议使用任意静态文件服务器；部分浏览器会阻止 `file://` 方式加载 JavaScript Modules。没有 Node.js 时，也可以直接上传到 GitHub Pages 后预览。

## 六、无需 Node.js 的自检

部署后可以访问以下页面：

- `tests/unit-tests.html`：检查本地日期、跨日、当前 Streak、最长 Streak、完成率和每日名言轮换。页面应显示 `0 failed`。
- `tests/layout-tests.html`：在 390px 宽的模拟视口中检查页面是否横向溢出。

真实云端写入还需要按前面的步骤创建 Supabase 项目、执行 SQL 并填写配置。

## 数据与隐私边界

- 数据保存在 Supabase 云数据库。
- 浏览器 LocalStorage 只由 Supabase SDK 保存匿名会话令牌。
- 清除网站数据、更换浏览器或使用无痕模式会创建新的匿名账户，旧数据不会自动迁移。
- 匿名账户没有邮箱找回能力。后续如需跨设备同步，应增加邮箱验证或 OAuth 登录。
- RLS 是数据隔离的安全边界。若关闭 RLS 或配置了过宽策略，任何访问者都可能读写数据。

## 常见问题

### 页面提示“先连接你的云数据库”

`config.js` 中的 URL、Publishable/anon key 仍是占位值，或 URL 格式不正确。重新从 Supabase 的 API 设置中复制并提交到 GitHub Pages。

### 页面提示“Supabase 尚未启用匿名登录”

回到 **Authentication → Providers → Anonymous Sign-Ins**，启用该功能。保存后等待片刻并刷新网页。

### 页面提示“云数据库权限或表结构尚未配置完成”

确认已完整执行 `supabase/schema.sql`。不要在只创建表后跳过 RLS 和 grant 语句。

### 页面提示 Supabase 客户端加载失败

客户端从 jsDelivr CDN 动态加载。检查网络或浏览器扩展是否拦截了 `cdn.jsdelivr.net`。

### 数据没有保存

界面会先更新，写入失败时自动回滚并显示提示。检查浏览器 Network 面板和 Supabase 日志，确认匿名会话有效、RLS 已启用且表结构完整。
