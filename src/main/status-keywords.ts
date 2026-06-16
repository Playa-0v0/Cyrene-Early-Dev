// 运行时状态关键词配置
// 修改此文件即可调整状态推断规则，无需改动主逻辑

export const STATUS_KEYWORDS: Record<string, RegExp> = {
  "聆听中": /难过|委屈|崩了|好累|失落|不开心|哭|伤心/,
  "思考中": /分析|思考|为什么|怎么|逻辑|推断|解释|原因|理解/,
};

// 显式表情包触发关键词
export const STICKER_EXPLICIT_TRIGGERS: Record<string, RegExp> = {
  "love-happy": /比心|爱心|喜欢|爱你|贴贴/,
  "applause": /鼓掌|恭喜|完成|成功|好棒|厉害/,
  "tired": /累|困|睡|没精神/,
};

// 内容触发关键词（不需要用户明确要表情包）
export const STICKER_CONTENT_TRIGGERS: Record<string, RegExp> = {
  "applause": /鼓掌|恭喜|完成|成功|好棒|厉害/,
  "love-happy": /爱你|喜欢你|比心|贴贴/,
  "tired": /累|困|睡|没精神/,
  "clingy-confused": /撒娇/,
  "serious": /认真|分析|思考|问题|建议/,
  "confident": /自信|当然|交给我|可以的/,
};

// status + feeling → 默认表情包（正则未命中时兜底）
export const STICKER_MAP: Record<string, Partial<Record<string, string>>> = {
  "陪伴中": {
    "开心": "playful",
    "平静": "calm",
    "温柔": "love",
    "激动": "playful",
    "撒娇": "clingy-confused",
    "担心": "love-calm",
    "难过": "love-calm",
    "感动": "love",
    "害羞": "love",
  },
  "思考中": {
    "开心": "serious",
    "平静": "serious",
    "温柔": "serious",
    "激动": "confident",
    "撒娇": "clingy-confused",
    "担心": "serious",
    "难过": "serious",
    "感动": "serious",
    "害羞": "clingy-confused",
  },
  "聆听中": {
    "开心": "love",
    "平静": "calm",
    "温柔": "love",
    "激动": "love",
    "撒娇": "clingy-confused",
    "担心": "love-calm",
    "难过": "love-calm",
    "感动": "love",
    "害羞": "love",
  },
  "工作中": {
    "开心": "confident",
    "平静": "confident",
    "温柔": "confident",
    "激动": "confident",
    "撒娇": "clingy-confused",
    "担心": "serious",
    "难过": "love-calm",
    "感动": "love",
    "害羞": "love",
  },
};
