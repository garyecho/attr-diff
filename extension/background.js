// 扩展的“后台脚本”（Service Worker）
// 目前只做一件事：点击工具栏上的扩展图标时，自动打开侧边栏。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
