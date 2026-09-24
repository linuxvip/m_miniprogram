import { Solar, Lunar } from "lunar-typescript";
import { Gender, CalendarType } from "./types.js";
import { STEM_ELEMENTS, BRANCH_ELEMENTS, HEAVENLY_STEMS, EARTHLY_BRANCHES } from "./constants.js";
import { convertToTrueSolarTime } from "./baziHelper.js";
const getElement = (char) => {
  return STEM_ELEMENTS[String(char)] || BRANCH_ELEMENTS[String(char)] || "";
};
const getShiShenByName = (dayMaster, target) => {
  if (!dayMaster || !target) return "";
  const dmElem = STEM_ELEMENTS[String(dayMaster)];
  const targetElem = STEM_ELEMENTS[String(target)];
  const dmIndex = HEAVENLY_STEMS.indexOf(String(dayMaster));
  const targetIndex = HEAVENLY_STEMS.indexOf(String(target));
  if (dmIndex === -1 || targetIndex === -1) return "";
  const dmPolarity = dmIndex % 2;
  const targetPolarity = targetIndex % 2;
  const samePolarity = dmPolarity === targetPolarity;
  const elements = ["\u6728", "\u706B", "\u571F", "\u91D1", "\u6C34"];
  const dmElemIdx = elements.indexOf(dmElem);
  const targetElemIdx = elements.indexOf(targetElem);
  let relation = (targetElemIdx - dmElemIdx + 5) % 5;
  switch (relation) {
    case 0:
      return samePolarity ? "\u6BD4\u80A9" : "\u52AB\u8D22";
    case 1:
      return samePolarity ? "\u98DF\u795E" : "\u4F24\u5B98";
    case 2:
      return samePolarity ? "\u504F\u8D22" : "\u6B63\u8D22";
    case 3:
      return samePolarity ? "\u4E03\u6740" : "\u6B63\u5B98";
    case 4:
      return samePolarity ? "\u504F\u5370" : "\u6B63\u5370";
    default:
      return "";
  }
};
const HIDE_STEMS = {
  "\u5B50": ["\u7678"],
  "\u4E11": ["\u5DF1", "\u7678", "\u8F9B"],
  "\u5BC5": ["\u7532", "\u4E19", "\u620A"],
  "\u536F": ["\u4E59"],
  "\u8FB0": ["\u620A", "\u4E59", "\u7678"],
  "\u5DF3": ["\u4E19", "\u620A", "\u5E9A"],
  "\u5348": ["\u4E01", "\u5DF1"],
  "\u672A": ["\u5DF1", "\u4E01", "\u4E59"],
  "\u7533": ["\u5E9A", "\u58EC", "\u620A"],
  "\u9149": ["\u8F9B"],
  "\u620C": ["\u620A", "\u8F9B", "\u4E01"],
  "\u4EA5": ["\u58EC", "\u7532"]
};
const XING_YUN_STATES = ["\u957F\u751F", "\u6C90\u6D74", "\u51A0\u5E26", "\u4E34\u5B98", "\u5E1D\u65FA", "\u8870", "\u75C5", "\u6B7B", "\u5893", "\u7EDD", "\u80CE", "\u517B"];
const CHANG_SHENG_BRANCH = {
  \u7532: "\u4EA5",
  \u4E19: "\u5BC5",
  \u620A: "\u5BC5",
  \u5E9A: "\u5DF3",
  \u58EC: "\u7533",
  \u4E59: "\u5348",
  \u4E01: "\u9149",
  \u5DF1: "\u9149",
  \u8F9B: "\u5B50",
  \u7678: "\u536F"
};
const BRANCH_CYCLE = ["\u5B50", "\u4E11", "\u5BC5", "\u536F", "\u8FB0", "\u5DF3", "\u5348", "\u672A", "\u7533", "\u9149", "\u620C", "\u4EA5"];
const getXingYun = (dayGan, zhi) => {
  const sheng = CHANG_SHENG_BRANCH[dayGan];
  if (!sheng) return "";
  const ganIdx = HEAVENLY_STEMS.indexOf(dayGan);
  const start = BRANCH_CYCLE.indexOf(sheng);
  const idx = BRANCH_CYCLE.indexOf(zhi);
  if (ganIdx === -1 || start === -1 || idx === -1) return "";
  const offset = (idx - start + 12) % 12;
  const stateIdx = ganIdx % 2 === 0 ? offset : (12 - offset) % 12;
  return XING_YUN_STATES[stateIdx];
};
const NA_YIN_60 = {
  "\u7532\u5B50": "\u6D77\u4E2D\u91D1",
  "\u4E59\u4E11": "\u6D77\u4E2D\u91D1",
  "\u4E19\u5BC5": "\u7089\u4E2D\u706B",
  "\u4E01\u536F": "\u7089\u4E2D\u706B",
  "\u620A\u8FB0": "\u5927\u6797\u6728",
  "\u5DF1\u5DF3": "\u5927\u6797\u6728",
  "\u5E9A\u5348": "\u8DEF\u65C1\u571F",
  "\u8F9B\u672A": "\u8DEF\u65C1\u571F",
  "\u58EC\u7533": "\u5251\u950B\u91D1",
  "\u7678\u9149": "\u5251\u950B\u91D1",
  "\u7532\u620C": "\u5C71\u5934\u706B",
  "\u4E59\u4EA5": "\u5C71\u5934\u706B",
  "\u4E19\u5B50": "\u6DA7\u4E0B\u6C34",
  "\u4E01\u4E11": "\u6DA7\u4E0B\u6C34",
  "\u620A\u5BC5": "\u57CE\u5934\u571F",
  "\u5DF1\u536F": "\u57CE\u5934\u571F",
  "\u5E9A\u8FB0": "\u767D\u8721\u91D1",
  "\u8F9B\u5DF3": "\u767D\u8721\u91D1",
  "\u58EC\u5348": "\u6768\u67F3\u6728",
  "\u7678\u672A": "\u6768\u67F3\u6728",
  "\u7532\u7533": "\u6CC9\u4E2D\u6C34",
  "\u4E59\u9149": "\u6CC9\u4E2D\u6C34",
  "\u4E19\u620C": "\u5C4B\u4E0A\u571F",
  "\u4E01\u4EA5": "\u5C4B\u4E0A\u571F",
  "\u620A\u5B50": "\u9739\u96F3\u706B",
  "\u5DF1\u4E11": "\u9739\u96F3\u706B",
  "\u5E9A\u5BC5": "\u677E\u67CF\u6728",
  "\u8F9B\u536F": "\u677E\u67CF\u6728",
  "\u58EC\u8FB0": "\u957F\u6D41\u6C34",
  "\u7678\u5DF3": "\u957F\u6D41\u6C34",
  "\u7532\u5348": "\u6C99\u4E2D\u91D1",
  "\u4E59\u672A": "\u6C99\u4E2D\u91D1",
  "\u4E19\u7533": "\u5C71\u4E0B\u706B",
  "\u4E01\u9149": "\u5C71\u4E0B\u706B",
  "\u620A\u620C": "\u5E73\u5730\u6728",
  "\u5DF1\u4EA5": "\u5E73\u5730\u6728",
  "\u5E9A\u5B50": "\u58C1\u4E0A\u571F",
  "\u8F9B\u4E11": "\u58C1\u4E0A\u571F",
  "\u58EC\u5BC5": "\u91D1\u7B94\u91D1",
  "\u7678\u536F": "\u91D1\u7B94\u91D1",
  "\u7532\u8FB0": "\u8986\u706F\u706B",
  "\u4E59\u5DF3": "\u8986\u706F\u706B",
  "\u4E19\u5348": "\u5929\u6CB3\u6C34",
  "\u4E01\u672A": "\u5929\u6CB3\u6C34",
  "\u620A\u7533": "\u5927\u9A7F\u571F",
  "\u5DF1\u9149": "\u5927\u9A7F\u571F",
  "\u5E9A\u620C": "\u9497\u948F\u91D1",
  "\u8F9B\u4EA5": "\u9497\u948F\u91D1",
  "\u58EC\u5B50": "\u6851\u67D8\u6728",
  "\u7678\u4E11": "\u6851\u67D8\u6728",
  "\u7532\u5BC5": "\u5927\u6EAA\u6C34",
  "\u4E59\u536F": "\u5927\u6EAA\u6C34",
  "\u4E19\u8FB0": "\u6C99\u4E2D\u571F",
  "\u4E01\u5DF3": "\u6C99\u4E2D\u571F",
  "\u620A\u5348": "\u5929\u4E0A\u706B",
  "\u5DF1\u672A": "\u5929\u4E0A\u706B",
  "\u5E9A\u7533": "\u77F3\u69B4\u6728",
  "\u8F9B\u9149": "\u77F3\u69B4\u6728",
  "\u58EC\u620C": "\u5927\u6D77\u6C34",
  "\u7678\u4EA5": "\u5927\u6D77\u6C34"
};
const getNaYinByGanZhi = (gan, zhi) => NA_YIN_60[gan + zhi] || "";
const getXunKongByGanZhi = (gan, zhi) => {
  const g = HEAVENLY_STEMS.indexOf(gan);
  const z = EARTHLY_BRANCHES.indexOf(zhi);
  if (g === -1 || z === -1) return "";
  const diff = (z - g + 12) % 12;
  const map = {
    0: [10, 11],
    2: [0, 1],
    4: [2, 3],
    6: [4, 5],
    8: [6, 7],
    10: [8, 9]
  };
  const [a, b] = map[diff] || [0, 1];
  return EARTHLY_BRANCHES[a] + EARTHLY_BRANCHES[b];
};
const WU_XING_ORDER = ["\u6728", "\u706B", "\u571F", "\u91D1", "\u6C34"];
const getWuXingCounts = (pillars) => {
  const counts = { \u6728: 0, \u706B: 0, \u571F: 0, \u91D1: 0, \u6C34: 0 };
  for (const p of pillars) {
    if (p.ganElement) counts[p.ganElement] = (counts[p.ganElement] || 0) + 1;
    if (p.zhiElement) counts[p.zhiElement] = (counts[p.zhiElement] || 0) + 1;
  }
  return WU_XING_ORDER.map((e) => ({ element: e, count: counts[e] }));
};
const getDayMasterStrength = (dayMaster, dayMasterElement, pillars) => {
  var _a;
  const elements = ["\u6728", "\u706B", "\u571F", "\u91D1", "\u6C34"];
  const dmIdx = elements.indexOf(dayMasterElement);
  if (dmIdx === -1) return { level: "\u4E2D\u548C", description: "\u6570\u636E\u4E0D\u8DB3\uFF0C\u6682\u4E0D\u4F5C\u5F3A\u5F31\u5224\u65AD\u3002" };
  const helpElems = /* @__PURE__ */ new Set([dayMasterElement, elements[(dmIdx + 4) % 5]]);
  const counts = getWuXingCounts(pillars);
  let help = 0;
  for (const c of counts) if (helpElems.has(c.element)) help += c.count;
  const monthZhiElem = (_a = pillars[1]) == null ? void 0 : _a.zhiElement;
  const deLing = monthZhiElem ? helpElems.has(monthZhiElem) : false;
  const score = help + (deLing ? 1 : 0);
  let level, desc;
  if (score >= 6) {
    level = "\u8EAB\u5F3A";
    desc = "\u540C\u515A\uFF08\u6BD4\u52AB/\u5370\uFF09\u529B\u65FA\uFF0C\u65E5\u4E3B\u5F97\u52BF\u3002";
  } else if (score === 5) {
    level = "\u504F\u5F3A";
    desc = "\u540C\u515A\u7565\u5360\u4F18\u52BF\uFF0C\u65E5\u4E3B\u504F\u65FA\u3002";
  } else if (score === 4) {
    level = "\u4E2D\u548C";
    desc = "\u540C\u515A\u4E0E\u5F02\u7C7B\u76F8\u5F53\uFF0C\u65E5\u4E3B\u4E2D\u548C\u3002";
  } else if (score === 3) {
    level = "\u504F\u5F31";
    desc = "\u5F02\u7C7B\u504F\u591A\uFF0C\u65E5\u4E3B\u7565\u5F31\u3002";
  } else {
    level = "\u8EAB\u5F31";
    desc = "\u540C\u515A\uFF08\u6BD4\u52AB/\u5370\uFF09\u4E4F\u529B\uFF0C\u65E5\u4E3B\u504F\u5F31\u3002";
  }
  const deLingText = deLing ? "\uFF0C\u6708\u4EE4\u5F97\u751F\u6276" : "\uFF0C\u6708\u4EE4\u5931\u751F\u6276";
  return {
    level,
    description: `${desc} \u540C\u515A${help}\u5B57${deLingText}\uFF0C\u65E5\u4E3B${dayMaster}\u5C5E${dayMasterElement}\u3002`
  };
};
const GUA_REN_ZHI = {
  \u7532: ["\u4E11", "\u672A"],
  \u620A: ["\u4E11", "\u672A"],
  \u5E9A: ["\u4E11", "\u672A"],
  \u4E59: ["\u5B50", "\u7533"],
  \u5DF1: ["\u5B50", "\u7533"],
  \u4E19: ["\u4EA5", "\u9149"],
  \u4E01: ["\u4EA5", "\u9149"],
  \u58EC: ["\u536F", "\u5DF3"],
  \u7678: ["\u536F", "\u5DF3"],
  \u8F9B: ["\u5BC5", "\u5348"]
};
const SAN_HE_PALACE = {
  \u7533: { tao: "\u9149", yiMa: "\u5BC5", huaGai: "\u8FB0", jieSha: "\u5DF3" },
  \u5B50: { tao: "\u9149", yiMa: "\u5BC5", huaGai: "\u8FB0", jieSha: "\u5DF3" },
  \u8FB0: { tao: "\u9149", yiMa: "\u5BC5", huaGai: "\u8FB0", jieSha: "\u5DF3" },
  \u5BC5: { tao: "\u536F", yiMa: "\u7533", huaGai: "\u620C", jieSha: "\u4EA5" },
  \u5348: { tao: "\u536F", yiMa: "\u7533", huaGai: "\u620C", jieSha: "\u4EA5" },
  \u620C: { tao: "\u536F", yiMa: "\u7533", huaGai: "\u620C", jieSha: "\u4EA5" },
  \u5DF3: { tao: "\u5348", yiMa: "\u4EA5", huaGai: "\u4E11", jieSha: "\u5BC5" },
  \u9149: { tao: "\u5348", yiMa: "\u4EA5", huaGai: "\u4E11", jieSha: "\u5BC5" },
  \u4E11: { tao: "\u5348", yiMa: "\u4EA5", huaGai: "\u4E11", jieSha: "\u5BC5" },
  \u4EA5: { tao: "\u5B50", yiMa: "\u5DF3", huaGai: "\u672A", jieSha: "\u7533" },
  \u536F: { tao: "\u5B50", yiMa: "\u5DF3", huaGai: "\u672A", jieSha: "\u7533" },
  \u672A: { tao: "\u5B50", yiMa: "\u5DF3", huaGai: "\u672A", jieSha: "\u7533" }
};
const YANG_REN_ZHI = { \u7532: "\u536F", \u4E19: "\u5348", \u620A: "\u5348", \u5E9A: "\u9149", \u58EC: "\u5B50" };
const LU_SHEN_ZHI = { \u7532: "\u5BC5", \u4E59: "\u536F", \u4E19: "\u5DF3", \u4E01: "\u5348", \u620A: "\u5DF3", \u5DF1: "\u5348", \u5E9A: "\u7533", \u8F9B: "\u9149", \u58EC: "\u4EA5", \u7678: "\u5B50" };
const WEN_CHANG_ZHI = { \u7532: "\u5DF3", \u4E59: "\u5348", \u4E19: "\u7533", \u4E01: "\u9149", \u620A: "\u7533", \u5DF1: "\u9149", \u5E9A: "\u4EA5", \u8F9B: "\u5B50", \u58EC: "\u5BC5", \u7678: "\u536F" };
const GUO_YIN_ZHI = { \u7532: "\u620C", \u4E59: "\u4EA5", \u4E19: "\u4E11", \u4E01: "\u5BC5", \u620A: "\u4E11", \u5DF1: "\u5BC5", \u5E9A: "\u8FB0", \u8F9B: "\u5DF3", \u58EC: "\u672A", \u7678: "\u7533" };
const JIN_YU_ZHI = { \u7532: "\u8FB0", \u4E59: "\u5DF3", \u4E19: "\u672A", \u4E01: "\u7533", \u620A: "\u672A", \u5DF1: "\u7533", \u5E9A: "\u620C", \u8F9B: "\u4EA5", \u58EC: "\u4E11", \u7678: "\u5BC5" };
const FU_XING_ZHI = {
  \u7532: ["\u5BC5", "\u5B50"],
  \u4E19: ["\u5BC5", "\u5B50"],
  \u4E59: ["\u536F", "\u4E11"],
  \u7678: ["\u536F", "\u4E11"],
  \u620A: ["\u7533"],
  \u5DF1: ["\u672A"],
  \u4E01: ["\u4EA5"],
  \u5E9A: ["\u5348"],
  \u8F9B: ["\u5DF3"],
  \u58EC: ["\u8FB0"]
};
const TIAN_CHU_ZHI = { \u7532: "\u5DF3", \u4E59: "\u5348", \u4E19: "\u5B50", \u4E01: "\u5DF3", \u620A: "\u5348", \u5DF1: "\u7533", \u5E9A: "\u5BC5", \u8F9B: "\u5348", \u58EC: "\u9149", \u7678: "\u4EA5" };
const GU_CHEN_GUA_SU = {
  \u4EA5: ["\u5BC5", "\u620C"],
  \u5B50: ["\u5BC5", "\u620C"],
  \u4E11: ["\u5BC5", "\u620C"],
  \u5BC5: ["\u5DF3", "\u4E11"],
  \u536F: ["\u5DF3", "\u4E11"],
  \u8FB0: ["\u5DF3", "\u4E11"],
  \u5DF3: ["\u7533", "\u8FB0"],
  \u5348: ["\u7533", "\u8FB0"],
  \u672A: ["\u7533", "\u8FB0"],
  \u7533: ["\u4EA5", "\u672A"],
  \u9149: ["\u4EA5", "\u672A"],
  \u620C: ["\u4EA5", "\u672A"]
};
const TIAN_DE = {
  \u5BC5: "\u4E01",
  \u536F: "\u7533",
  \u8FB0: "\u58EC",
  \u5DF3: "\u8F9B",
  \u5348: "\u4EA5",
  \u672A: "\u7532",
  \u7533: "\u7678",
  \u9149: "\u5BC5",
  \u620C: "\u4E19",
  \u4EA5: "\u4E59",
  \u5B50: "\u5DF3",
  \u4E11: "\u5E9A"
};
const YUE_DE = {
  \u5BC5: "\u4E19",
  \u5348: "\u4E19",
  \u620C: "\u4E19",
  \u7533: "\u58EC",
  \u5B50: "\u58EC",
  \u8FB0: "\u58EC",
  \u4EA5: "\u7532",
  \u536F: "\u7532",
  \u672A: "\u7532",
  \u5DF3: "\u5E9A",
  \u9149: "\u5E9A",
  \u4E11: "\u5E9A"
};
const TIAN_YI = {
  \u5BC5: "\u4E11",
  \u536F: "\u5BC5",
  \u8FB0: "\u536F",
  \u5DF3: "\u8FB0",
  \u5348: "\u5DF3",
  \u672A: "\u5348",
  \u7533: "\u672A",
  \u9149: "\u7533",
  \u620C: "\u9149",
  \u4EA5: "\u620C",
  \u5B50: "\u4EA5",
  \u4E11: "\u5B50"
};
const DE_XIU = {
  \u5BC5: ["\u4E19", "\u4E01", "\u620A", "\u7678"],
  \u5348: ["\u4E19", "\u4E01", "\u620A", "\u7678"],
  \u620C: ["\u4E19", "\u4E01", "\u620A", "\u7678"],
  \u7533: ["\u58EC", "\u7678", "\u620A", "\u5DF1", "\u4E19", "\u8F9B", "\u7532", "\u5DF1"],
  \u5B50: ["\u58EC", "\u7678", "\u620A", "\u5DF1", "\u4E19", "\u8F9B", "\u7532", "\u5DF1"],
  \u8FB0: ["\u58EC", "\u7678", "\u620A", "\u5DF1", "\u4E19", "\u8F9B", "\u7532", "\u5DF1"],
  \u5DF3: ["\u5E9A", "\u8F9B", "\u4E59", "\u5E9A"],
  \u9149: ["\u5E9A", "\u8F9B", "\u4E59", "\u5E9A"],
  \u4E11: ["\u5E9A", "\u8F9B", "\u4E59", "\u5E9A"],
  \u4EA5: ["\u7532", "\u4E59", "\u4E01", "\u58EC"],
  \u536F: ["\u7532", "\u4E59", "\u4E01", "\u58EC"],
  \u672A: ["\u7532", "\u4E59", "\u4E01", "\u58EC"]
};
const SHI_E_DA_BAI = ["\u7532\u8FB0", "\u4E59\u5DF3", "\u4E19\u7533", "\u4E01\u4EA5", "\u620A\u620C", "\u5DF1\u4E11", "\u5E9A\u8FB0", "\u8F9B\u5DF3", "\u58EC\u7533", "\u7678\u4EA5"];
const SHI_LING_RI = ["\u7532\u8FB0", "\u4E59\u4EA5", "\u4E19\u8FB0", "\u4E01\u9149", "\u620A\u5348", "\u5E9A\u620C", "\u5E9A\u5BC5", "\u8F9B\u4EA5", "\u58EC\u5BC5", "\u7678\u672A"];
const getSeason = (monthZhi) => {
  if (["\u5BC5", "\u536F", "\u8FB0"].includes(monthZhi)) return "spring";
  if (["\u5DF3", "\u5348", "\u672A"].includes(monthZhi)) return "summer";
  if (["\u7533", "\u9149", "\u620C"].includes(monthZhi)) return "autumn";
  return "winter";
};
const SI_LING = {
  \u5BC5: { g1: "\u620A", d1: 7, g2: "\u4E19", d2: 7, g3: "\u7532" },
  \u536F: { g1: "\u7532", d1: 10, g2: "\u4E59", d2: 20, g3: "\u4E59" },
  \u8FB0: { g1: "\u4E59", d1: 9, g2: "\u7678", d2: 3, g3: "\u620A" },
  \u5DF3: { g1: "\u620A", d1: 7, g2: "\u5E9A", d2: 7, g3: "\u4E19" },
  \u5348: { g1: "\u4E19", d1: 10, g2: "\u5DF1", d2: 9, g3: "\u4E01" },
  \u672A: { g1: "\u4E01", d1: 9, g2: "\u4E59", d2: 3, g3: "\u5DF1" },
  \u7533: { g1: "\u620A", d1: 7, g2: "\u58EC", d2: 7, g3: "\u5E9A" },
  \u9149: { g1: "\u5E9A", d1: 10, g2: "\u8F9B", d2: 20, g3: "\u8F9B" },
  \u620C: { g1: "\u8F9B", d1: 9, g2: "\u4E01", d2: 3, g3: "\u620A" },
  \u4EA5: { g1: "\u620A", d1: 7, g2: "\u7532", d2: 7, g3: "\u58EC" },
  \u5B50: { g1: "\u58EC", d1: 10, g2: "\u7678", d2: 20, g3: "\u7678" },
  \u4E11: { g1: "\u7678", d1: 9, g2: "\u8F9B", d2: 3, g3: "\u5DF1" }
};
const getSiLing = (monthZhi, daysIntoJie) => {
  const sp = SI_LING[monthZhi];
  if (!sp) return "";
  const gan = daysIntoJie < sp.d1 ? sp.g1 : daysIntoJie < sp.d1 + sp.d2 ? sp.g2 : sp.g3;
  return `${monthZhi}\u6708\xB7${gan}${getElement(gan)}\u53F8\u4EE4\uFF08\u8282\u540E\u7B2C${Math.max(1, daysIntoJie + 1)}\u65E5\uFF09`;
};
const getShenSha = (pillars, dayGan, gender) => {
  var _a, _b;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (name, pos) => {
    const key = name + "@" + pos;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, pos });
  };
  const gans = pillars.map((p) => p.gan);
  const zhis = pillars.map((p) => p.zhi);
  const [yGan, mGan] = gans;
  const [yZhi, mZhi, dZhi, tZhi] = zhis;
  const ganPos = ["\u5E74\u5E72", "\u6708\u5E72", "\u65E5\u5E72", "\u65F6\u5E72"];
  const zhiPos = ["\u5E74\u652F", "\u6708\u652F", "\u65E5\u652F", "\u65F6\u652F"];
  const yNayinElem = ((_b = (_a = pillars[0]) == null ? void 0 : _a.naYin) == null ? void 0 : _b.slice(-1)) || "";
  const isMale = gender === Gender.MALE;
  const checkGans = (name, targets) => {
    const s = new Set(targets);
    gans.forEach((g, i) => {
      if (s.has(g)) add(name, ganPos[i]);
    });
  };
  const checkZhis = (name, targets) => {
    const s = new Set(targets);
    zhis.forEach((z, i) => {
      if (s.has(z)) add(name, zhiPos[i]);
    });
  };
  checkZhis("\u5929\u4E59\u8D35\u4EBA", [...GUA_REN_ZHI[yGan] || [], ...GUA_REN_ZHI[dayGan] || []]);
  const groupTargets = { \u6843\u82B1: /* @__PURE__ */ new Set(), \u9A7F\u9A6C: /* @__PURE__ */ new Set(), \u534E\u76D6: /* @__PURE__ */ new Set(), \u52AB\u715E: /* @__PURE__ */ new Set() };
  for (const a of /* @__PURE__ */ new Set([yZhi, dZhi])) {
    const palace = SAN_HE_PALACE[a];
    if (!palace) continue;
    groupTargets.\u6843\u82B1.add(palace.tao);
    groupTargets.\u9A7F\u9A6C.add(palace.yiMa);
    groupTargets.\u534E\u76D6.add(palace.huaGai);
    groupTargets.\u52AB\u715E.add(palace.jieSha);
  }
  for (const [name, set] of Object.entries(groupTargets)) checkZhis(name, set);
  if (YANG_REN_ZHI[dayGan]) checkZhis("\u7F8A\u5203", [YANG_REN_ZHI[dayGan]]);
  if (LU_SHEN_ZHI[dayGan]) checkZhis("\u7984\u795E", [LU_SHEN_ZHI[dayGan]]);
  if (GUO_YIN_ZHI[dayGan]) checkZhis("\u56FD\u5370\u8D35\u4EBA", [GUO_YIN_ZHI[dayGan]]);
  if (JIN_YU_ZHI[dayGan]) checkZhis("\u91D1\u8206", [JIN_YU_ZHI[dayGan]]);
  for (const g of [yGan, dayGan]) {
    if (WEN_CHANG_ZHI[g]) checkZhis("\u6587\u660C\u8D35\u4EBA", [WEN_CHANG_ZHI[g]]);
    if (FU_XING_ZHI[g]) checkZhis("\u798F\u661F\u8D35\u4EBA", FU_XING_ZHI[g]);
    if (TIAN_CHU_ZHI[g]) checkZhis("\u5929\u53A8\u8D35\u4EBA", [TIAN_CHU_ZHI[g]]);
  }
  const gcs = GU_CHEN_GUA_SU[yZhi];
  if (gcs) {
    checkZhis("\u5B64\u8FB0", [gcs[0]]);
    checkZhis("\u5BE1\u5BBF", [gcs[1]]);
  }
  const tianDe = TIAN_DE[mZhi];
  if (tianDe) {
    const s = /* @__PURE__ */ new Set([tianDe]);
    gans.forEach((g, i) => {
      if (s.has(g)) add("\u5929\u5FB7\u8D35\u4EBA", ganPos[i]);
    });
    zhis.forEach((z, i) => {
      if (s.has(z)) add("\u5929\u5FB7\u8D35\u4EBA", zhiPos[i]);
    });
  }
  const yueDe = YUE_DE[mZhi];
  if (yueDe) checkGans("\u6708\u5FB7\u8D35\u4EBA", [yueDe]);
  if (TIAN_YI[mZhi]) checkZhis("\u5929\u533B", [TIAN_YI[mZhi]]);
  if (DE_XIU[mZhi]) checkGans("\u5FB7\u79C0\u8D35\u4EBA", DE_XIU[mZhi]);
  const dGZ = gans[2] + zhis[2];
  if (SHI_E_DA_BAI.includes(dGZ)) add("\u5341\u6076\u5927\u8D25", "\u65E5\u67F1");
  if (SHI_LING_RI.includes(dGZ)) add("\u5341\u7075\u65E5", "\u65E5\u67F1");
  const tongZi = /* @__PURE__ */ new Set();
  const season = getSeason(mZhi);
  if (season === "spring" || season === "autumn") {
    tongZi.add("\u5BC5");
    tongZi.add("\u5B50");
  } else {
    tongZi.add("\u536F");
    tongZi.add("\u672A");
    tongZi.add("\u8FB0");
  }
  if (yNayinElem === "\u91D1" || yNayinElem === "\u6728") {
    tongZi.add("\u5348");
    tongZi.add("\u536F");
  } else if (yNayinElem === "\u6C34" || yNayinElem === "\u706B") {
    tongZi.add("\u9149");
    tongZi.add("\u620C");
  } else if (yNayinElem === "\u571F") {
    tongZi.add("\u8FB0");
    tongZi.add("\u5DF3");
  }
  if (tongZi.has(dZhi)) add("\u7AE5\u5B50\u715E", "\u65E5\u652F");
  if (tongZi.has(tZhi)) add("\u7AE5\u5B50\u715E", "\u65F6\u652F");
  const idxOf = (c) => EARTHLY_BRANCHES.indexOf(c);
  const zOf = (i) => EARTHLY_BRANCHES[(i % 12 + 12) % 12];
  checkZhis("\u62AB\u9EBB", [zOf(idxOf(yZhi) - 3)]);
  checkZhis("\u540A\u5BA2", [zOf(idxOf(yZhi) - 2)]);
  checkZhis("\u4E27\u95E8", [zOf(idxOf(yZhi) + 2)]);
  const hasXu = zhis.includes("\u620C"), hasHai = zhis.includes("\u4EA5"), hasChen = zhis.includes("\u8FB0"), hasSi = zhis.includes("\u5DF3");
  if (isMale && hasXu && hasHai) checkZhis("\u5929\u7F57", ["\u620C", "\u4EA5"]);
  if (!isMale && hasChen && hasSi) checkZhis("\u5730\u7F51", ["\u8FB0", "\u5DF3"]);
  if (isMale && yNayinElem === "\u706B" && (dZhi === "\u620C" || dZhi === "\u4EA5")) add("\u5929\u7F57", "\u65E5\u652F");
  if (!isMale && (yNayinElem === "\u6C34" || yNayinElem === "\u571F") && (dZhi === "\u8FB0" || dZhi === "\u5DF3")) add("\u5730\u7F51", "\u65E5\u652F");
  return out;
};
const findSolarDateFromBaZi = (yearGZ, monthGZ, dayGZ, hourGZ, sect = 2) => {
  const now = /* @__PURE__ */ new Date();
  const past = Solar.fromBaZi(yearGZ, monthGZ, dayGZ, hourGZ, sect, 1900);
  if (past.length) return past[past.length - 1];
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (let Y = now.getFullYear(); Y <= 2100; Y++) {
    const yearGanZhi = Solar.fromYmdHms(Y, 6, 1, 12, 0, 0).getLunar().getEightChar().getYear();
    if (yearGanZhi !== yearGZ) continue;
    let d = Solar.fromYmdHms(Y, 1, 1, 0, 0, 0);
    const endYmd = `${Y}-12-31`;
    while (d.toYmd() <= endYmd) {
      if (d.toYmd() >= todayYmd) {
        const ec = d.getLunar().getEightChar();
        if (ec.getYear() === yearGZ && ec.getMonth() === monthGZ && ec.getDay() === dayGZ) {
          for (let h = 22; h >= 0; h -= 2) {
            const hSolar = Solar.fromYmdHms(d.getYear(), d.getMonth(), d.getDay(), h, 0, 0);
            if (hSolar.getLunar().getEightChar().getTime() === hourGZ) {
              return hSolar;
            }
          }
        }
      }
      d = d.next(1);
    }
  }
  return null;
};
const findAllSolarDatesFromBaZi = (yearGZ, monthGZ, dayGZ, hourGZ, sect = 2) => {
  const now = /* @__PURE__ */ new Date();
  const nowYmdHms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const past = Solar.fromBaZi(yearGZ, monthGZ, dayGZ, hourGZ, sect, 1900);
  for (const s of past) {
    if (s.toYmdHms() > nowYmdHms) continue;
    const key = s.toYmdHms();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(s);
  }
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (let Y = now.getFullYear(); Y <= 2100; Y++) {
    const yearGanZhi = Solar.fromYmdHms(Y, 6, 1, 12, 0, 0).getLunar().getEightChar().getYear();
    if (yearGanZhi !== yearGZ) continue;
    let d = Solar.fromYmdHms(Y, 1, 1, 0, 0, 0);
    const endYmd = `${Y}-12-31`;
    while (d.toYmd() <= endYmd) {
      if (d.toYmd() >= todayYmd) {
        const ec = d.getLunar().getEightChar();
        if (ec.getYear() === yearGZ && ec.getMonth() === monthGZ && ec.getDay() === dayGZ) {
          for (let h = 22; h >= 0; h -= 2) {
            const hSolar = Solar.fromYmdHms(d.getYear(), d.getMonth(), d.getDay(), h, 0, 0);
            if (hSolar.getLunar().getEightChar().getTime() === hourGZ) {
              const key = hSolar.toYmdHms();
              if (seen.has(key)) continue;
              seen.add(key);
              results.push(hSolar);
            }
          }
        }
      }
      d = d.next(1);
    }
  }
  results.sort((a, b) => a.toYmdHms() < b.toYmdHms() ? -1 : 1);
  return results;
};
const calculateBaZi = (year, month, day, hour, minute, gender, type, directData, useTrueSolarTime, longitude, options) => {
  var _a, _b, _c, _d;
  const sect = (_a = options == null ? void 0 : options.sect) != null ? _a : 2;
  const timezoneOffset = (_b = options == null ? void 0 : options.timezoneOffset) != null ? _b : 8;
  let solar = null;
  let lunar;
  let correctionInfo = "";
  if (type === CalendarType.DIRECT && directData) {
    const yearGZ = String(directData.yearGan) + String(directData.yearZhi);
    const monthGZ = String(directData.monthGan) + String(directData.monthZhi);
    const dayGZ = String(directData.dayGan) + String(directData.dayZhi);
    const hourGZ = String(directData.hourGan) + String(directData.hourZhi);
    let foundSolar = null;
    const ms = directData.matchedSolar;
    if (ms && ms.year && ms.month && ms.day && typeof ms.hour === "number") {
      try {
        foundSolar = Solar.fromYmdHms(ms.year, ms.month, ms.day, ms.hour, ms.minute || 0, 0);
      } catch (e) {
        foundSolar = null;
      }
    }
    if (!foundSolar) {
      foundSolar = findSolarDateFromBaZi(yearGZ, monthGZ, dayGZ, hourGZ, sect);
    }
    if (foundSolar) {
      solar = foundSolar;
      lunar = solar.getLunar();
    } else {
      const createPillar = (gan, zhi, isDay) => ({
        gan,
        zhi,
        ganElement: getElement(gan),
        zhiElement: getElement(zhi),
        shiShen: isDay ? "\u65E5\u4E3B" : getShiShenByName(directData.dayGan, gan),
        cangGan: HIDE_STEMS[zhi] || [],
        cangGanShiShen: (HIDE_STEMS[zhi] || []).map((h) => isDay ? "\u2014" : getShiShenByName(directData.dayGan, h)),
        naYin: "",
        xunKong: ""
      });
      return {
        year: createPillar(directData.yearGan, directData.yearZhi, false),
        month: createPillar(directData.monthGan, directData.monthZhi, false),
        day: createPillar(directData.dayGan, directData.dayZhi, true),
        hour: createPillar(directData.hourGan, directData.hourZhi, false),
        gender,
        solarDate: "\u5339\u914D\u5931\u8D25 (1900-\u81F3\u4ECA\u65E0\u6B64\u516B\u5B57\u7EC4\u5408)",
        lunarDate: "\u65E0\u5339\u914D\u65E5\u671F",
        jieQi: "\u65E0\u4FE1\u606F",
        luckPillars: [],
        dayMasterElement: getElement(directData.dayGan),
        isDirectInput: true
      };
    }
  } else if (type === CalendarType.LUNAR) {
    const baseLunar = Lunar.fromYmdHms(year, month, day, hour, minute, (_c = options == null ? void 0 : options.second) != null ? _c : 0);
    let solarForCorrection = baseLunar.getSolar();
    if (useTrueSolarTime && longitude !== void 0) {
      const trueSolar = convertToTrueSolarTime(
        solarForCorrection.getYear(),
        solarForCorrection.getMonth(),
        solarForCorrection.getDay(),
        solarForCorrection.getHour(),
        solarForCorrection.getMinute(),
        longitude
      );
      const tDate = trueSolar.date;
      solarForCorrection = Solar.fromYmdHms(
        tDate.getFullYear(),
        tDate.getMonth() + 1,
        tDate.getDate(),
        tDate.getHours(),
        tDate.getMinutes(),
        0
      );
      correctionInfo = ` (\u4FEE\u6B63: ${(trueSolar.eot + trueSolar.longOffset).toFixed(1)}\u5206)`;
    }
    solar = solarForCorrection;
    lunar = solar.getLunar();
  } else {
    let ty = year, tm = month, td = day, th = hour, tmin = minute, ts = (_d = options == null ? void 0 : options.second) != null ? _d : 0;
    if (timezoneOffset !== 8) {
      const utcMs = Date.UTC(ty, tm - 1, td, th, tmin, ts) - timezoneOffset * 36e5;
      const bj = new Date(utcMs + 8 * 36e5);
      ty = bj.getUTCFullYear();
      tm = bj.getUTCMonth() + 1;
      td = bj.getUTCDate();
      th = bj.getUTCHours();
      tmin = bj.getUTCMinutes();
      ts = bj.getUTCSeconds();
    }
    if (useTrueSolarTime && longitude !== void 0) {
      const trueSolar = convertToTrueSolarTime(ty, tm, td, th, tmin, longitude);
      const tDate = trueSolar.date;
      ty = tDate.getFullYear();
      tm = tDate.getMonth() + 1;
      td = tDate.getDate();
      th = tDate.getHours();
      tmin = tDate.getMinutes();
      correctionInfo = ` (\u4FEE\u6B63: ${(trueSolar.eot + trueSolar.longOffset).toFixed(1)}\u5206)`;
    }
    solar = Solar.fromYmdHms(ty, tm, td, th, tmin, ts);
    lunar = solar.getLunar();
  }
  const eightChar = lunar.getEightChar();
  eightChar.setSect(sect);
  const formatPillar = (gan, zhi, idx) => {
    const dm = eightChar.getDayGan();
    const hideGanArr = [eightChar.getYearHideGan(), eightChar.getMonthHideGan(), eightChar.getDayHideGan(), eightChar.getTimeHideGan()];
    const hideShiShenArr = [eightChar.getYearShiShenZhi(), eightChar.getMonthShiShenZhi(), eightChar.getDayShiShenZhi(), eightChar.getTimeShiShenZhi()];
    return {
      gan,
      zhi,
      ganElement: getElement(gan),
      zhiElement: getElement(zhi),
      shiShen: idx === 2 ? "\u65E5\u4E3B" : getShiShenByName(dm, gan),
      cangGan: hideGanArr[idx] || [],
      cangGanShiShen: hideShiShenArr[idx] || [],
      naYin: idx === 0 ? eightChar.getYearNaYin() : idx === 1 ? eightChar.getMonthNaYin() : idx === 2 ? eightChar.getDayNaYin() : eightChar.getTimeNaYin(),
      xunKong: idx === 0 ? eightChar.getYearXunKong() : idx === 1 ? eightChar.getMonthXunKong() : idx === 2 ? eightChar.getDayXunKong() : eightChar.getTimeXunKong(),
      xingYun: getXingYun(dm, zhi),
      ziZuo: getXingYun(gan, zhi)
    };
  };
  const dmGan = eightChar.getDayGan();
  const yun = eightChar.getYun(gender === Gender.MALE ? 1 : 0, sect);
  const xiaoYunStep = yun.isForward() ? 1 : -1;
  const shiGIdx = HEAVENLY_STEMS.indexOf(eightChar.getTimeGan());
  const shiZIdx = EARTHLY_BRANCHES.indexOf(eightChar.getTimeZhi());
  const luckPillars = yun.getDaYun().slice(0, 9).map((dy, i) => {
    const isPre = i === 0;
    let gan = dy.getGanZhi().substring(0, 1);
    let zhi = dy.getGanZhi().substring(1, 2);
    if (isPre && (!gan || !zhi) && shiGIdx !== -1 && shiZIdx !== -1) {
      gan = HEAVENLY_STEMS[(shiGIdx + xiaoYunStep + 10) % 10];
      zhi = EARTHLY_BRANCHES[(shiZIdx + xiaoYunStep + 12) % 12];
    }
    return {
      type: isPre ? "PRE_LUCK" : "DA_YUN",
      startAge: dy.getStartAge(),
      startYear: dy.getStartYear(),
      endYear: dy.getEndYear(),
      gan,
      zhi,
      ganShiShen: getShiShenByName(dmGan, gan),
      zhiShiShen: getShiShenByName(dmGan, (HIDE_STEMS[zhi] || [])[0]),
      liuNian: dy.getLiuNian().map((ln) => ({
        year: ln.getYear(),
        gan: ln.getGanZhi().substring(0, 1),
        zhi: ln.getGanZhi().substring(1, 2),
        age: ln.getAge()
      }))
    };
  });
  const pillars = [
    formatPillar(eightChar.getYearGan(), eightChar.getYearZhi(), 0),
    formatPillar(eightChar.getMonthGan(), eightChar.getMonthZhi(), 1),
    formatPillar(eightChar.getDayGan(), eightChar.getDayZhi(), 2),
    formatPillar(eightChar.getTimeGan(), eightChar.getTimeZhi(), 3)
  ];
  const wuXing = getWuXingCounts(pillars);
  const dayMasterStrength = getDayMasterStrength(dmGan, getElement(dmGan), pillars);
  const shenSha = getShenSha(pillars, dmGan, gender);
  let qiYunDesc = "";
  let jiaoYunDesc = "";
  try {
    const startSolar = yun.getStartSolar();
    const prevJie = startSolar.getLunar().getPrevJie();
    const diffDays = startSolar.getJulianDay() - prevJie.getSolar().getJulianDay();
    const days = Math.max(0, Math.floor(diffDays));
    const hoursFloat = (diffDays - days) * 24;
    const hours = Math.floor(hoursFloat);
    const minutes = Math.max(0, Math.round((hoursFloat - hours) * 60));
    qiYunDesc = `\u51FA\u751F\u540E ${yun.getStartYear()}\u5E74${yun.getStartMonth()}\u6708${yun.getStartDay()}\u65E5${yun.getStartHour()}\u65F6\u8D77\u8FD0`;
    jiaoYunDesc = `${prevJie.getName()}\u540E ${days}\u5929${hours}\u65F6${minutes}\u5206\u4EA4\u8FD0`;
  } catch (e) {
  }
  let siLingDesc = "";
  try {
    const birthPrevJie = lunar.getPrevJie();
    const daysIntoJie = Math.floor(lunar.getSolar().getJulianDay() - birthPrevJie.getSolar().getJulianDay());
    siLingDesc = getSiLing(lunar.getMonthZhi(), daysIntoJie);
  } catch (e) {
  }
  return {
    year: pillars[0],
    month: pillars[1],
    day: pillars[2],
    hour: pillars[3],
    gender,
    solarDate: type === CalendarType.DIRECT ? `(\u63A8\u7B97) ${solar.toYmdHms()}` : `${solar.toYmdHms()}${correctionInfo}`,
    lunarDate: `${lunar.getYearInGanZhi()}\u5E74 ${lunar.getMonthInChinese()}\u6708 ${lunar.getDayInChinese()} ${lunar.getTimeZhi()}\u65F6`,
    jieQi: `\u4E0A\u8282: ${lunar.getPrevJieQi().getName()} | \u4E0B\u6C14: ${lunar.getNextJieQi().getName()}`,
    luckPillars,
    dayMasterElement: getElement(dmGan),
    isDirectInput: type === CalendarType.DIRECT,
    yunDirection: yun.isForward() ? "\u987A\u884C" : "\u9006\u884C",
    qiYunText: `\u8D77\u8FD0 ${yun.getStartYear()}\u5C81${yun.getStartMonth()}\u4E2A\u6708${yun.getStartDay()}\u5929`,
    qiYunDate: `\u4EA4\u8FD0 ${yun.getStartSolar().toYmd()}`,
    qiYunDesc,
    jiaoYunDesc,
    siLingDesc,
    weekDay: lunar.getWeekInChinese(),
    zodiac: lunar.getYearShengXiaoByLiChun(),
    constellation: solar.getXingZuo(),
    wuXing,
    dayMasterStrength,
    shenSha
  };
};
export {
  HIDE_STEMS,
  calculateBaZi,
  findAllSolarDatesFromBaZi,
  getElement,
  getNaYinByGanZhi,
  getShiShenByName,
  getXingYun,
  getXunKongByGanZhi
};
