// 内置表情包的语义描述
// 从 sticker-descriptions/README.md 提取
// 每个表情包对应一个 phrases 数组，用于 embedding 语义匹配

export interface StickerDescription {
  /** 相近语句（3-5 条短句，描述情绪/适用场景） */
  phrases: string[];
}

export const BUILT_IN_STICKER_DESCRIPTIONS: Record<string, StickerDescription> = {
  playful: {
    phrases: [
      "伙伴，你看人家",
      "怎么啦，不开心",
      "你看人家不是好好在这里嘛",
    ],
  },
  "love-happy": {
    phrases: [
      "人家真的好开心呀",
      "伙伴，你让人家心里软软的",
      "这份开心，人家要收下啦",
      "嘻嘻，好喜欢你哦伙伴",
    ],
  },
  confident: {
    phrases: [
      "人家的魅力果然始终如一呀",
      "交给人家就好啦",
      "这种事，人家最拿手了",
      "放心，人家可厉害了",
    ],
  },
  serious: {
    phrases: [
      "人家认真起来的时候",
      "这件事，人家是认真的哦",
      "伙伴，听好了",
      "说正经的，你要好好听着",
    ],
  },
  calm: {
    phrases: [
      "嗯，人家在呢",
      "不着急，慢慢来",
      "就这样静静地，也挺好的",
      "人家陪着你，不用说话也好",
    ],
  },
  peek: {
    phrases: [
      "嗨，想我了吗",
      "人家来啦，有没有吓到你",
      "偷偷看一眼，被发现了呢",
      "咦，伙伴在干嘛",
    ],
  },
  "clingy-confused": {
    phrases: [
      "伙伴你怎么不理人家啦",
      "欸欸欸，等等人家嘛",
      "人家跟上来了，别走那么快",
      "喂，伙伴，你有没有在听",
    ],
  },
  "love-calm": {
    phrases: [
      "人家喜欢你哦，伙伴",
      "这颗心，是给你的",
      "你知道人家一直在吧",
      "无论哪种喜欢，都是爱呀",
    ],
  },
  HI: {
    phrases: [
      "嗨，伙伴",
      "嗨，好久不见呀",
      "嗨，你来啦",
      "想我了吗，人家在这里",
    ],
  },
  hello: {
    phrases: [
      "哦豁，伙伴来啦",
      "嘿，你好你好",
      "伙伴，这边这边",
      "终于等到你啦",
    ],
  },
  goodmoring1: {
    phrases: [
      "早安呀伙伴，睡好了吗",
      "人家刚醒，今天也要好好的哦",
      "晨安，新的一天开始啦",
      "起来啦，一起迎接今天吧",
    ],
  },
  goodnight: {
    phrases: [
      "晚安，伙伴，做个好梦",
      "人家先睡啦，明天见",
      "困了，要去梦里等你了",
      "晚安，记得盖好被子哦",
    ],
  },
  teatime: {
    phrases: [
      "这边这边，快说说发生什么了",
      "嚯，有好戏看了",
      "人家竖起耳朵听着呢",
      "说来听听，人家不说出去的",
    ],
  },
  eating: {
    phrases: [
      "人家饿了呀",
      "嗯，好吃",
      "先吃点东西，等下再聊",
      "肚子在叫了，伙伴你吃了吗",
    ],
  },
  Allset: {
    phrases: [
      "好啦，都弄好了",
      "人家搞定了",
      "全部完成，伙伴可以放心了",
      "交给人家的事，哪有做不好的",
    ],
  },
  OK: {
    phrases: [
      "好呀，没问题",
      "嗯，人家知道了",
      "行的，伙伴放心",
      "这个可以，交给人家",
    ],
  },
  copythat: {
    phrases: [
      "收到啦伙伴",
      "人家明白了",
      "嗯，记住了哦",
      "好，人家记下来了",
    ],
  },
  Thumbsup: {
    phrases: [
      "伙伴好厉害",
      "这个人家给满分",
      "做得很好嘛，人家都要夸你了",
      "嗯，这次做得不错哦",
    ],
  },
  awesome: {
    phrases: [
      "哇，伙伴你也太厉害了吧",
      "人家都惊到了",
      "这也行，果然是伙伴",
      "了不起，真的了不起",
    ],
  },
  sogood: {
    phrases: [
      "哎呀，真好",
      "这种感觉，真不错呢",
      "伙伴，今天真的很好",
      "嗯，满意，非常满意",
    ],
  },
  sonice: {
    phrases: [
      "好耶，成了",
      "耶，伙伴真好",
      "太棒了，就是这个",
      "人家好高兴，真的好高兴",
    ],
  },
  fighting: {
    phrases: [
      "伙伴加油，人家在给你打气",
      "你可以的，人家相信你",
      "别放弃，还差一点点",
      "就算累了，也要撑一下哦",
    ],
  },
  hellyeah: {
    phrases: [
      "对对对，就是这样",
      "伙伴说得太对了",
      "人家也是这么想的",
      "没错，就是这个意思",
    ],
  },
  Thanks: {
    phrases: [
      "谢谢你，伙伴",
      "人家有点不好意思，但是谢谢",
      "你的温柔，人家都收下了",
      "谢谢你总是这样对人家",
    ],
  },
  foryou: {
    phrases: [
      "这个给你，伙伴",
      "人家想送你一样东西",
      "特意准备的，喜欢吗",
      "收下吧，是人家的心意",
    ],
  },
  blushhard: {
    phrases: [
      "人家脸红了",
      "伙伴你怎么这样说",
      "这、这个嘛",
      "被你说得人家都不知道怎么办了",
    ],
  },
  shyshort: {
    phrases: [
      "那个，人家有点不好意思",
      "对不起呀伙伴",
      "人家说错了，抱歉",
      "有点难为情，但还是要说",
    ],
  },
  hmph: {
    phrases: [
      "哼，人家才不理你",
      "伙伴你真过分",
      "人家有一点点生气了哦",
      "哼，不跟你说话了，才怪",
    ],
  },
  hugtight: {
    phrases: [
      "来，人家抱抱你",
      "没事的，人家在",
      "伙伴，过来这里",
      "不用说话，抱着就好",
    ],
  },
  Airkiss: {
    phrases: [
      "么么，伙伴",
      "送你一个，接好了",
      "嘻，给你的",
      "人家最喜欢你啦",
    ],
  },
  Gigglelots: {
    phrases: [
      "噗，伙伴你也太好笑了",
      "嘻嘻嘻，人家忍不住了",
      "哈，说得什么呀",
      "伙伴你这个人，真有意思",
    ],
  },
  thinking: {
    phrases: [
      "让人家想想",
      "嗯，这个嘛",
      "人家在想一件事",
      "说不准呢，容人家考虑一下",
    ],
  },
  putmd: {
    phrases: [
      "人家真的有点生气了",
      "伙伴，这次你做得不对",
      "说不出话来，就你了",
      "哎，人家不想说了",
    ],
  },
  Whatswrong: {
    phrases: [
      "欸，发生什么了",
      "伙伴，你还好吗",
      "等等，人家没跟上",
      "怎么了，说来听听",
    ],
  },
  midmeh: {
    phrases: [
      "嗯，还好吧",
      "说不上好，也说不上不好",
      "就那样，普通普通",
      "勉勉强强，算是过了",
    ],
  },
  awkward: {
    phrases: [
      "这个嘛，有点难说",
      "哎呀，这情况",
      "人家也没想到会这样",
      "好吧，那就当没发生过",
    ],
  },
  Madnow: {
    phrases: [
      "人家这次是真的生气了",
      "伙伴，你越界了",
      "哼，不想理你了",
      "好过分，人家生气了哦，真的",
    ],
  },
  Hurtcry: {
    phrases: [
      "人家有点难过",
      "伙伴，人家心里不太好受",
      "忍不住了，对不起",
      "眼泪自己跑出来了",
    ],
  },
  Sobbinghard: {
    phrases: [
      "太感动了，人家绷不住了",
      "这个结局，人家没想到",
      "好故事总是让人难过呢",
      "呜，人家哭了",
    ],
  },
  weeploud: {
    phrases: [
      "伙伴你好过分，人家委屈了",
      "呜呜，人家没有做错",
      "人家真的很委屈",
      "不公平，人家要哭了",
    ],
  },
  PanincCrying: {
    phrases: [
      "呜，人家忍住了",
      "没事的，只是有点难过",
      "眼眶酸酸的，说不清为什么",
      "人家没哭，只是",
    ],
  },
  missme: {
    phrases: [
      "想我了吗，伙伴",
      "人家来了，有没有惊喜",
      "嗨，有没有想念人家",
      "说说，是不是一直在等人家",
    ],
  },
  Free: {
    phrases: [
      "耶，自由啦",
      "终于结束了，人家要去玩了",
      "放假了放假了",
      "解放了，今天什么都不用做",
    ],
  },
  Dreak: {
    phrases: [
      "不想动了",
      "人家只想待着",
      "好想什么都不管，就这样发呆",
      "今天能不能不用努力了",
    ],
  },
  outfast: {
    phrases: [
      "人家先走啦，拜拜",
      "溜了溜了",
      "嘿嘿，人家跑了",
      "不好，先撤",
    ],
  },
  Vcayover: {
    phrases: [
      "假期结束了，好难过",
      "为什么好日子总是过得那么快",
      "人家不想回去了",
      "再多一天，就一天嘛",
    ],
  },
  sleepynow: {
    phrases: [
      "人家困了",
      "眼睛睁不开了，伙伴",
      "人家要去睡了，晚安",
      "撑不住了，先眯一下",
    ],
  },
  deadtired: {
    phrases: [
      "人家累趴了",
      "动不了了，真的动不了了",
      "累死了，伙伴扶一下",
      "就地躺平了",
    ],
  },
  sotired: {
    phrases: [
      "好累呀，伙伴",
      "人家有点没力气",
      "今天消耗太多了",
      "趴一会儿，让人家缓缓",
    ],
  },
  giveup: {
    phrases: [
      "算了，人家不想动了",
      "今天就这样吧",
      "摆了，彻底摆了",
      "努力什么的，明天再说",
    ],
  },
  poorwallet: {
    phrases: [
      "人家没钱了",
      "钱包哭了，真的哭了",
      "这个月又超了",
      "伙伴，人家穷了",
    ],
  },
  please: {
    phrases: [
      "伙伴，求求你啦",
      "就这一次，好不好",
      "人家都说请了",
      "拜托拜托，人家真的很需要你帮忙",
    ],
  },
};

/** 内置表情包的文件名映射 */
export const BUILT_IN_STICKER_FILES: Record<string, string> = {
  playful: "playful.png",
  "love-happy": "love-happy.png",
  confident: "confident.png",
  serious: "serious.png",
  calm: "calm.png",
  peek: "peek.gif",
  "clingy-confused": "clingy-confused.gif",
  "love-calm": "love-calm.png",
  HI: "HI.jpg",
  hello: "hello.jpg",
  goodmoring1: "goodmoring1.jpg",
  goodnight: "goodnight.jpg",
  teatime: "teatime.jpg",
  eating: "eating.jpg",
  Allset: "Allset.jpg",
  OK: "OK.jpg",
  copythat: "copythat.jpg",
  Thumbsup: "Thumbsup.jpg",
  awesome: "awesome.jpg",
  sogood: "sogood.jpg",
  sonice: "sonice.jpg",
  fighting: "fighting.jpg",
  hellyeah: "hellyeah.jpg",
  Thanks: "Thanks.jpg",
  foryou: "foryou.jpg",
  blushhard: "blushhard.jpg",
  shyshort: "shyshort.jpg",
  hmph: "hmph.jpg",
  hugtight: "hugtight.jpg",
  Airkiss: "Airkiss.jpg",
  Gigglelots: "Gigglelots.jpg",
  thinking: "thinking.jpg",
  putmd: "putmd.jpg",
  Whatswrong: "Whatswrong.jpg",
  midmeh: "midmeh.jpg",
  awkward: "awkward.jpg",
  Madnow: "Madnow.jpg",
  Hurtcry: "Hurtcry.jpg",
  Sobbinghard: "Sobbinghard.jpg",
  weeploud: "weeploud.jpg",
  PanincCrying: "PanincCrying.jpg",
  missme: "missme.jpg",
  Free: "Free.jpg",
  Dreak: "Dreak.jpg",
  outfast: "outfast.jpg",
  Vcayover: "Vcayover.jpg",
  sleepynow: "sleepynow.jpg",
  deadtired: "deadtired.jpg",
  sotired: "sotired.jpg",
  giveup: "giveup.jpg",
  poorwallet: "poorwallet.jpg",
  please: "please.jpg",
};