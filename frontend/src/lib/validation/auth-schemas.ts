import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "Vui lòng nhập email").email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(2, "Họ tên phải có ít nhất 2 ký tự"),
  email: z.string().min(1, "Vui lòng nhập email").email("Email không hợp lệ"),
  password: z
    .string()
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
  phone: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || /^[0-9+\s]{8,15}$/.test(value),
      "Số điện thoại không hợp lệ",
    ),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;
