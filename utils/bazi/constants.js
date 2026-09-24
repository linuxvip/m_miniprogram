const ELEMENT_COLORS = {
  "\u6728": { bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-300" },
  "\u706B": { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-300" },
  "\u571F": { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  "\u91D1": { bg: "bg-slate-200", text: "text-slate-800", border: "border-slate-400" },
  "\u6C34": { bg: "bg-sky-100", text: "text-sky-900", border: "border-sky-300" },
  "default": { bg: "bg-stone-100", text: "text-stone-800", border: "border-stone-300" }
};
const HEAVENLY_STEMS = ["\u7532", "\u4E59", "\u4E19", "\u4E01", "\u620A", "\u5DF1", "\u5E9A", "\u8F9B", "\u58EC", "\u7678"];
const EARTHLY_BRANCHES = ["\u5B50", "\u4E11", "\u5BC5", "\u536F", "\u8FB0", "\u5DF3", "\u5348", "\u672A", "\u7533", "\u9149", "\u620C", "\u4EA5"];
const STEM_ELEMENTS = {
  "\u7532": "\u6728",
  "\u4E59": "\u6728",
  "\u4E19": "\u706B",
  "\u4E01": "\u706B",
  "\u620A": "\u571F",
  "\u5DF1": "\u571F",
  "\u5E9A": "\u91D1",
  "\u8F9B": "\u91D1",
  "\u58EC": "\u6C34",
  "\u7678": "\u6C34"
};
const BRANCH_ELEMENTS = {
  "\u5BC5": "\u6728",
  "\u536F": "\u6728",
  "\u5DF3": "\u706B",
  "\u5348": "\u706B",
  "\u8FB0": "\u571F",
  "\u620C": "\u571F",
  "\u4E11": "\u571F",
  "\u672A": "\u571F",
  "\u7533": "\u91D1",
  "\u9149": "\u91D1",
  "\u4EA5": "\u6C34",
  "\u5B50": "\u6C34"
};
export {
  BRANCH_ELEMENTS,
  EARTHLY_BRANCHES,
  ELEMENT_COLORS,
  HEAVENLY_STEMS,
  STEM_ELEMENTS
};
