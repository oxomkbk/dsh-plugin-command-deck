// Deck-control language understanding (English / 中文) — the client half of the NLU.
//
// Every input channel (typed, voice, palette, radial) goes through understandCommand() first:
//   • short commands that operate the deck itself — “open the images panel”, “切换到中文”, “矩阵主题”,
//     “reset layout”, “放大地球”, “工作区 2”, “lock layout” — run locally, instantly, and are echoed in
//     the trace as LOCAL so you can see what was understood;
//   • everything else is a request for the agent and goes to the backend NLU (backend/agent/nlu.py),
//     which understands weather / time / maths / money / notes / reminders / places / research.
// Matching is anchored to the whole utterance, so a question that merely *mentions* a panel
// (“what images of Saturn exist?”) is never swallowed as a command.

const PANELS = {   // whole-phrase names only (anchored below)
  taskgraph: 'task ?graph|graph|plan|任务图|任务|计划', trace: 'trace|agent trace|log|轨迹|日志|追踪', summary: 'summary|answer|摘要|总结|答案',
  images: 'images?|pictures?|photos?|gallery|image grid|图片|图像|相册', metrics: 'key data|data|metrics|figures|数据|关键数据|指标', timeline: 'timeline|时间线|时间轴',
  sources: 'sources?|links?|来源|链接', analytics: 'analytics|charts?|统计|图表|分析', terminal: 'terminal|tool output|console|终端|输出',
};
const THEMES = { jarvis: /jarvis|orbital|default|贾维斯|轨道|默认/, neon: /neon( noir)?|cyberpunk|霓虹|赛博朋克/, synthwave: /synthwave|outrun|retro wave|合成浪潮|蒸汽波/,
  aurora: /aurora|极光/, apollo: /apollo|mission control|nasa|阿波罗|任务控制|复古/, mecha: /mecha|robot|gundam|eva|机甲|机器人/,
  blueprint: /blueprint|technical drawing|drawing|蓝图|工程图/, terminal: /terminal|console|crt|hacker|matrix|终端|控制台|黑客|矩阵/,
  brutal: /brutal(ist|ism)?|poster|粗野(主义)?|海报/, monolith: /monolith|gold|black and gold|luxury|黑金|金色|奢华/,
  glass: /glass|spatial|vision|玻璃|空间/, helmet: /visor|helmet|pilot|hud|头盔|面罩|飞行员/, arctic: /arctic|ice|white|light|冰原|冰雪|白色|浅色/ };
const THEME_WORDS = 'jarvis|orbital|default|neon( noir)?|cyberpunk|synthwave|outrun|retro wave|aurora|apollo|mission control|nasa|mecha|robot|gundam|eva|blueprint|technical drawing|drawing|terminal|console|crt|hacker|matrix|brutal(ist|ism)?|poster|monolith|gold|black and gold|luxury|glass|spatial|vision|visor|helmet|pilot|hud|arctic|ice|white|light';
const THEME_WORDS_ZH = '贾维斯|轨道|默认|霓虹|赛博朋克|合成浪潮|蒸汽波|极光|阿波罗|任务控制|复古|机甲|机器人|蓝图|工程图|终端|控制台|黑客|矩阵|粗野主义|粗野|海报|黑金|金色|奢华|玻璃|空间|头盔|面罩|飞行员|冰原|冰雪|白色|浅色';
const strip = (s) => s.trim().toLowerCase().replace(/^(please|hey deck,?|ok deck,?|deck,?|请|帮我|麻烦|给我)\s*/, '').replace(/[.!?。！？~]+$/, '').replace(/\s+/g, ' ').trim();
const panelOf = (s) => {
  const core = s.trim().replace(/^(the|my)\s+/, '').replace(/\s*(panel|card|window|面板|窗口|卡片)$/, '').trim();
  return Object.entries(PANELS).find(([, alt]) => new RegExp(`^(${alt})$`).test(core))?.[0];
};

const RULES = [
  // language
  [/^(switch( the)?( ui| interface)?( language)? to |use |change( the)? language to |language:? )?(english|英文|英语)( ui| mode| please)?$|^(切换到|切换成|换成|改成|用)(英文|英语)(界面|模式)?$/, () => ({ action: 'lang', arg: 'en' })],
  [/^(switch( the)?( ui| interface)?( language)? to |use |change( the)? language to |language:? )?(chinese|中文|汉语)( ui| mode| please)?$|^(切换到|切换成|换成|改成|用)?(中文|汉语)(界面|模式)?$/, () => ({ action: 'lang', arg: 'zh' })],
  // panels
  [/^(open|show|bring up|display|打开|显示|展开)( the| my)? (.+?)( panel| card| window)?$|^(打开|显示|展开)(.+?)(面板|窗口|卡片)?$/, (m, s) => { const p = panelOf(s.replace(/^(open|show|bring up|display|打开|显示|展开)/, '')); return p ? { action: 'open', arg: p } : null; }],
  [/^(close|hide|dismiss|关闭|隐藏|关掉)( the)? (.+?)( panel| card| window)?$|^(关闭|隐藏|关掉)(.+?)(面板|窗口|卡片)?$/, (m, s) => { const p = panelOf(s.replace(/^(close|hide|dismiss|关闭|隐藏|关掉)/, '')); return p ? { action: 'close', arg: p } : null; }],
  [/^(focus( on)?|maximi[sz]e|enlarge|expand|centre stage|center stage|聚焦|放大|最大化)( the)? (.+?)( panel)?$|^(聚焦|最大化|放大)(.+?)(面板|窗口)$/, (m, s) => { const p = panelOf(s.replace(/^(focus( on)?|maximi[sz]e|enlarge|expand|聚焦|放大|最大化)/, '')); return p ? { action: 'max', arg: p } : null; }],
  // theme
  // explicit phrasing only ("outrun theme", "switch to brutalist", "切换到极光主题"): a bare "apollo" or "aurora" is a research question
  [new RegExp(`^(?:(?:switch|change)(?: the)? theme(?: to)? |(?:switch|change|go) to(?: the)? |theme:? |use(?: the)? )(?:${THEME_WORDS})(?: theme| mode| style| look)?$|^(?:${THEME_WORDS}) (?:theme|mode|style|look)$|^(?:切换到?|换成|使用)(?:${THEME_WORDS_ZH})(?:主题|模式|风格)?$|^(?:${THEME_WORDS_ZH})(?:主题|模式|风格)$`), (m, s) => { const th = Object.entries(THEMES).find(([, re]) => re.test(s))?.[0]; return th ? { action: 'theme', arg: th } : null; }],
  // layout & view
  [/^(reset|restore)( the)? (layout|panels|docks)$|^(重置|恢复)(布局|面板|默认布局)$/, () => ({ action: 'resetLayout' })],
  [/^(reset|recenter|re-center|centre|center)( the)? (view|globe|camera)$|^(重置|复位)(视角|地球|视图|镜头)$|^(地球|视角)复位$/, () => ({ action: 'resetView' })],
  [/^(lock|pin|freeze)( the)? (layout|panels|windows)$|^(锁定|固定)(布局|面板|窗口)$/, () => ({ action: 'layoutLock', arg: true })],
  [/^(unlock|unpin|unfreeze)( the)? (layout|panels|windows)$|^(解锁|取消锁定|取消固定)(布局|面板|窗口)?$/, () => ({ action: 'layoutLock', arg: false })],
  [/^zoom in( on the globe)?$|^(放大|拉近)(地球|视图)?$/, () => ({ action: 'zoom', arg: 1.25 })],
  [/^zoom out( of the globe)?$|^(缩小|拉远)(地球|视图)?$/, () => ({ action: 'zoom', arg: 0.8 })],
  [/^(workspace|desk|view|视图|画面|工作区|桌面) ?([1-4一二三四])$|^(switch to|go to|切换到|去)( the)? ?(workspace|view|工作区|视图|画面) ?([1-4一二三四])$/, (m, s) => ({ action: 'workspace', arg: '1234一二三四'.indexOf(s.match(/[1-4一二三四]/)[0]) % 4 })],
  [/^(next|previous|prev) (workspace|view)$|^(下一个|上一个)(工作区|视图|画面)$/, (m, s) => ({ action: 'workspaceStep', arg: /next|下一个/.test(s) ? 1 : -1 })],
  // agent control (also spoken during a call via voice/call.js)
  [/^(stop|cancel|abort|停止|停下|取消)$/, () => ({ action: 'interrupt' })],
  [/^(pause|wait|暂停|等一下)$/, () => ({ action: 'pause' })],
  [/^(resume|continue|继续|恢复)$/, () => ({ action: 'resume' })],
  [/^(clear|clear (the )?(canvas|screen|results)|清空|清屏|清空结果)$/, () => ({ action: 'clear' })],
  // deck features
  [/^(help|show help|帮助|显示帮助|怎么用)$/, () => ({ action: 'help', arg: 'gestures' })],
  [/^(shortcuts|keyboard shortcuts|快捷键)$/, () => ({ action: 'help', arg: 'shortcuts' })],
  [/^(settings|preferences|open settings|设置|打开设置)$/, () => ({ action: 'help', arg: 'settings' })],
  [/^((turn |switch )?(on|enable|start) (hand )?gestures?|gestures? on|打开手势|开启手势|启用手势)$/, () => ({ action: 'gestures', arg: true })],
  [/^((turn |switch )?(off|disable|stop) (hand )?gestures?|gestures? off|关闭手势|停用手势)$/, () => ({ action: 'gestures', arg: false })],
  [/^(start (a )?(voice )?call|call|打电话|开始通话|语音通话)$/, () => ({ action: 'call', arg: true })],
  [/^(hang up|end (the )?call|挂断|结束通话)$/, () => ({ action: 'call', arg: false })],
  [/^(history|show history|历史|历史记录)$/, () => ({ action: 'history' })],
  [/^(command palette|palette|命令面板)$/, () => ({ action: 'palette' })],
  [/^(tour|guided tour|新手引导|引导)$/, () => ({ action: 'tour' })],
];

/** Text → { action, arg } for deck-control commands, or null (= a request for the agent). */
export function understandCommand(text) {
  const s = strip(text || '');
  if (!s || s.length > 48) return null;
  for (const [re, fn] of RULES) {
    const m = s.match(re);
    if (m) { const r = fn(m, s); if (r) return { ...r, text: s }; }
  }
  return null;
}
