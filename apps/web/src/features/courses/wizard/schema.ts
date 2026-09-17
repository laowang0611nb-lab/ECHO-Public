import { z } from "zod";

export const courseBasicInfoSchema = z.object({
  name: z.string().trim().min(2, "课程名称至少 2 个字符").max(40, "课程名称最多 40 个字符"),
  courseCode: z.string().trim().max(32, "课程代码最多 32 个字符").optional().or(z.literal("")),
  term: z.string().trim().min(1, "请选择学期"),
  courseType: z.enum(["专业课程", "公共基础课", "实验课程", "选修课程", "其他"]),
  description: z.string().trim().min(10, "课程简介至少 10 个字符").max(500, "课程简介最多 500 字"),
  audience: z.string().trim().max(120, "适用对象最多 120 个字符").optional().or(z.literal("")),
  expectedStudents: z
    .string()
    .trim()
    .refine((value) => !value || /^\d+$/.test(value), "请输入有效人数")
    .refine((value) => !value || Number(value) <= 1000, "人数不能超过 1000"),
});

export type CourseBasicInfo = z.infer<typeof courseBasicInfoSchema>;

export const defaultCourseBasicInfo: CourseBasicInfo = {
  name: "",
  courseCode: "",
  term: "2026 秋季学期",
  courseType: "专业课程",
  description: "",
  audience: "本科",
  expectedStudents: "",
};
