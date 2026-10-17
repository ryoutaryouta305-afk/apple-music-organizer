/* Apple Music Organizer
 * Read-only prototype. It never edits or deletes library items.
 * Provide a MusicKit developer token only after creating it through Apple's official developer tools.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const tokenInput = $("developer-token");
  const connectButton = $("connect");
  const loadButton = $("load-playlists");
  const playlistSelect = $("playlist-select");
  const scanButton = $("scan");
  const connectionStatus = $("connection-status");
  const scanStatus = $("scan-status");
  const summary = $("summary");
  const results = $("results");

  let music = null;
  let playlists = [];

  function status(el, message) { el.textContent = message; }
  function safeText(value) { return String(value ?? ""); }

  async function apiGet(path) {
    if (!music) throw new Error("先にApple Musicへ接続してください。");
    return music.api.music(path);
  }

  connectButton.addEventListener("click", async () => {
    const developerToken = tokenInput.value.trim();
    if (!developerToken) {
      status(connectionStatus, "開発者トークンを入力してください。Apple IDのパスワードではありません。");
      return;
    }
    if (!window.MusicKit) {
      status(connectionStatus, "MusicKitを読み込めませんでした。ページを再読み込みして、ネットワーク制限を確認してください。");
      return;
    }
    connectButton.disabled = true;
    status(connectionStatus, "MusicKitを設定しています…");
    try {
      await MusicKit.configure({
        developerToken,
        app: { name: "Apple Music Organizer", build: "1.0.0" }
      });
      music = MusicKit.getInstance();
      await music.authorize();
      status(connectionStatus, "接続しました。次にライブラリを読み込んでください。");
      loadButton.disabled = false;
      playlistSelect.disabled = false;
    } catch (error) {
      music = null;
      status(connectionStatus, "接続できませんでした: " + (error?.message || "認証がキャンセルされたか、トークンが無効です。"));
    } finally {
      connectButton.disabled = false;
    }
  });

  loadButton.addEventListener("click", async () => {
    loadButton.disabled = true;
    status(scanStatus, "プレイリストを読み込んでいます…");
    try {
      let path = "/v1/me/library/playlists?limit=100";
      playlists = [];
      while (path) {
        const response = await apiGet(path);
        playlists.push(...(response.data || []));
        const next = response.next;
        path = next ? (next.startsWith("/") ? next : new URL(next).pathname + new URL(next).search) : "";
      }
      playlistSelect.replaceChildren(new Option("プレイリストを選択", ""));
      for (const playlist of playlists) {
        playlistSelect.add(new Option(playlist.attributes?.name || "名称不明", playlist.id));
      }
      scanButton.disabled = playlists.length === 0;
      status(scanStatus, playlists.length ? playlists.length + " 件のプレイリストを読み込みました。" : "ライブラリにプレイリストが見つかりませんでした。");
    } catch (error) {
      status(scanStatus, "読み込みに失敗しました: " + (error?.message || "APIエラー"));
    } finally {
      loadButton.disabled = false;
    }
  });

  scanButton.addEventListener("click", async () => {
    const selectedId = playlistSelect.value;
    const playlist = playlists.find((item) => item.id === selectedId);
    if (!playlist) {
      status(scanStatus, "先にプレイリストを選択してください。");
      return;
    }
    scanButton.disabled = true;
    results.replaceChildren();
    summary.textContent = "";
    status(scanStatus, "曲を取得して重複をチェックしています…");
    try {
      const songs = [];
      let path = "/v1/me/library/playlists/" + encodeURIComponent(selectedId) + "/tracks?limit=100";
      while (path) {
        const response = await apiGet(path);
        songs.push(...(response.data || []));
        const next = response.next;
        path = next ? (next.startsWith("/") ? next : new URL(next).pathname + new URL(next).search) : "";
      }
      const keyFor = (song) => {
        const a = song.attributes || {};
        // Prefer the catalog song ID when present; otherwise use normalized title + artist.
        return a.playParams?.catalogId
          ? "catalog:" + a.playParams.catalogId
          : "text:" + [a.name, a.artistName].map(v => safeText(v).normalize("NFKC").trim().toLocaleLowerCase()).join("|");
      };
      const groups = new Map();
      for (const song of songs) {
        const key = keyFor(song);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(song);
      }
      const duplicates = [...groups.values()].filter(group => group.length > 1);
      summary.textContent = "「" + (playlist.attributes?.name || "選択したプレイリスト") + "」：全 " + songs.length + " 曲 / 重複候補 " + duplicates.length + " 組";
      if (!duplicates.length) {
        results.innerHTML = '<p class="empty">重複候補は見つかりませんでした。</p>';
      } else {
        for (const group of duplicates) {
          const first = group[0].attributes || {};
          const article = document.createElement("article");
          article.className = "result-group";
          const heading = document.createElement("h3");
          heading.textContent = safeText(first.name) || "曲名不明";
          const artist = document.createElement("p");
          artist.textContent = safeText(first.artistName) || "アーティスト不明";
          const count = document.createElement("p");
          count.innerHTML = '<span class="pill">' + group.length + ' 件</span> 同じ曲の候補';
          article.append(heading, artist, count);
          results.append(article);
        }
      }
      status(scanStatus, "チェック完了。曲は削除・変更していません。");
    } catch (error) {
      status(scanStatus, "曲の取得に失敗しました: " + (error?.message || "APIエラー"));
    } finally {
      scanButton.disabled = false;
    }
  });
})();
