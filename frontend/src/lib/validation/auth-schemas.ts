import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "Vui lòng nhập email").email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// Khớp ĐÚNG rule backend (RegisterDto — xem backend/src/auth/dto/register.dto.ts):
// SĐT VN 10 số bắt đầu bằng 0, CCCD 12 chữ số. Export riêng để dùng lại ở nơi
// khác (VD form bổ sung CCCD ở /profile) mà không lệch quy tắc.
export const VN_PHONE_REGEX = /^0\d{9}$/;
export const VN_PHONE_MESSAGE =
  "Số điện thoại không hợp lệ (phải có 10 số, bắt đầu bằng 0)";
export const CCCD_REGEX = /^\d{12}$/;
export const CCCD_MESSAGE = "Số CCCD phải gồm đúng 12 chữ số";

export const registerSchema = z.object({
  name: z.string().min(2, "Họ tên phải có ít nhất 2 ký tự"),
  email: z.string().min(1, "Vui lòng nhập email").email("Email không hợp lệ"),
  password: z
    .string()
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
  // Bắt buộc từ khi triển khai KYC (mục 7 Roadmap) — chống 1 người tạo nhiều
  // tài khoản "sạch" để thuê rồi chiếm đoạt, xem CLAUDE.md mục 2.
  phone: z.string().min(1, "Vui lòng nhập số điện thoại").regex(VN_PHONE_REGEX, VN_PHONE_MESSAGE),
  cccd: z.string().min(1, "Vui lòng nhập số CCCD").regex(CCCD_REGEX, CCCD_MESSAGE),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const profileSchema = z.object({
  name: z.string().min(2, "Họ tên phải có ít nhất 2 ký tự"),
  phone: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || /^[0-9+\s]{8,15}$/.test(value),
      "Số điện thoại không hợp lệ",
    ),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

// Form "bổ sung CCCD" riêng ở trang /profile (cho tài khoản cũ tạo trước khi
// có KYC) — CHỈ 1 field, tách khỏi profileSchema vì không sửa cùng lúc với
// tên/SĐT (xem ChangePasswordSection/ProfileInfoSection làm mẫu tách form).
export const addCccdSchema = z.object({
  cccd: z.string().min(1, "Vui lòng nhập số CCCD").regex(CCCD_REGEX, CCCD_MESSAGE),
});

export type AddCccdFormValues = z.infer<typeof addCccdSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Vui lòng nhập email").email("Email không hợp lệ"),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
    confirmNewPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmNewPassword"],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
    confirmNewPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmNewPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

// Đăng ký bằng Google/Facebook: CÙNG quy tắc SĐT/CCCD với registerSchema, bỏ
// mật khẩu, bắt buộc đồng ý điều khoản. Email chỉ bắt nhập khi provider không
// trả email đã xác minh (form tự khoá ô email trong trường hợp ngược lại).
export const socialRegisterSchema = z.object({
  name: z.string().min(2, "Họ tên phải có ít nhất 2 ký tự"),
  email: z.string().min(1, "Vui lòng nhập email").email("Email không hợp lệ"),
  phone: z.string().min(1, "Vui lòng nhập số điện thoại").regex(VN_PHONE_REGEX, VN_PHONE_MESSAGE),
  cccd: z.string().min(1, "Vui lòng nhập số CCCD").regex(CCCD_REGEX, CCCD_MESSAGE),
  acceptTerms: z.boolean().refine((v) => v, "Bạn cần đồng ý với điều khoản sử dụng"),
});

export type SocialRegisterFormValues = z.infer<typeof socialRegisterSchema>;
