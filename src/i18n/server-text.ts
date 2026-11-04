import type { Locale } from "./config";

/**
 * Arabic for every user-facing message produced on the server (AppError, Zod
 * schemas, database RAISE EXCEPTION text). Code keeps English as the source of
 * truth; localizeServerText() translates at the boundary (runAction, form
 * actions) so business logic and logs stay language-neutral.
 */
const EXACT: Record<string, string> = {
  // Generic
  "Something went wrong. Please try again.": "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
  "Something went wrong": "حدث خطأ ما",
  "Reminder not found": "لم يُعثر على التذكير",
  "Could not prepare the reminder": "تعذّر تجهيز التذكير",
  "Only scheduled appointments can get a reminder": "يمكن إرسال التذكير للمواعيد المجدولة فقط",
  "WhatsApp could not be reached": "تعذّر الاتصال بواتساب",
  "Unexpected server response.": "استجابة غير متوقعة من الخادم.",
  "Please check the highlighted fields.": "يرجى مراجعة الحقول المحددة.",
  "Please sign in to continue.": "يرجى تسجيل الدخول للمتابعة.",
  "Please sign in again.": "يرجى تسجيل الدخول مرة أخرى.",
  "You are not allowed to perform this action.": "لا تملك صلاحية تنفيذ هذا الإجراء.",
  "Invalid date": "تاريخ غير صالح",

  // Staff auth
  "Enter a valid email address": "أدخل بريدًا إلكترونيًا صالحًا",
  "Enter a valid email": "أدخل بريدًا إلكترونيًا صالحًا",
  "Enter your password": "أدخل كلمة المرور",
  "Incorrect email or password.": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "This account has been deactivated. Please contact the doctor.": "تم إيقاف هذا الحساب. يرجى التواصل مع الطبيب.",
  "This sign-in is for clinic staff. Patients sign in from the patient portal.":
    "هذا الدخول مخصص لطاقم العيادة. تسجّل الزائرات الدخول من بوابة الزائرات.",

  // Patient auth / OTP
  "Enter your mobile number": "أدخل رقم الجوال",
  "Enter a mobile number": "أدخل رقم الجوال",
  "Enter a valid mobile number": "أدخل رقم جوال صالحًا",
  "Enter a valid phone number": "أدخل رقم هاتف صالحًا",
  "Enter your full name": "أدخل اسمك الكامل",
  "Use at least 8 characters": "استخدم 8 أحرف على الأقل",
  "At least 8 characters": "8 أحرف على الأقل",
  "Maximum 72 characters": "72 حرفًا كحد أقصى",
  "Passwords don't match": "كلمتا المرور غير متطابقتين",
  "Enter the 4-digit code": "أدخلي الرمز المكوّن من 4 أرقام",
  "Incorrect mobile number or password.": "رقم الجوال أو كلمة المرور غير صحيحة.",
  "This sign-in is for patients. Clinic staff sign in at /login.":
    "هذا الدخول مخصص للزائرات. يسجّل طاقم العيادة الدخول من صفحة دخول الطاقم.",
  "Your account is not active. Please contact the clinic.": "حسابك غير مفعّل. يرجى التواصل مع العيادة.",
  "This phone number is already registered. Please sign in instead.": "هذا الرقم مسجّل مسبقًا. يرجى تسجيل الدخول بدلًا من ذلك.",
  "Already registered — sign in instead": "مسجّل مسبقًا — سجّل الدخول",
  "Could not update your registration": "تعذّر تحديث تسجيلك",
  "Could not create your account": "تعذّر إنشاء حسابك",
  "Could not create a verification code": "تعذّر إنشاء رمز التحقق",
  "Could not generate a new code.": "تعذّر إنشاء رمز جديد.",
  "We couldn't create your account. Please try again.": "تعذّر إنشاء حسابك. يرجى المحاولة مرة أخرى.",
  "We couldn't verify the code. Please try again.": "تعذّر التحقق من الرمز. يرجى المحاولة مرة أخرى.",
  "Please register again.": "يرجى التسجيل مرة أخرى.",
  "Registration is missing a phone number": "التسجيل لا يحتوي على رقم جوال",
  "No active code. Request a new one.": "لا يوجد رمز فعّال. اطلب رمزًا جديدًا.",
  "This code has expired. Request a new one.": "انتهت صلاحية هذا الرمز. اطلب رمزًا جديدًا.",
  "Code expired": "انتهت صلاحية الرمز",
  "Too many attempts. Request a new code.": "محاولات كثيرة. اطلب رمزًا جديدًا.",
  "Too many attempts": "محاولات كثيرة",
  "Incorrect code": "رمز غير صحيح",
  "This code was already used.": "تم استخدام هذا الرمز مسبقًا.",
  "A new code was generated.": "تم إنشاء رمز جديد.",
  "A new code was sent to your WhatsApp.": "تم إرسال رمز جديد إلى واتساب.",
  "We couldn't send the WhatsApp code. Please try again in a moment.": "تعذّر إرسال الرمز عبر واتساب. يرجى المحاولة بعد قليل.",
  "Your number isn't verified yet. Send the code from WhatsApp, then try again.":
    "لم يتم التحقق من رقمك بعد. أرسل الرمز من واتساب ثم أعد المحاولة.",

  // Patients (staff)
  "Enter the patient's full name": "أدخل الاسم الكامل للزائرة",
  "Enter the full name": "أدخل الاسم الكامل",
  "Use the date picker": "استخدم منتقي التاريخ",
  "Enter a valid date of birth": "أدخل تاريخ ميلاد صالحًا",
  "Patient not found.": "لم يتم العثور على الزائرة.",
  "Patient not found": "لم يتم العثور على الزائرة",
  "A patient with this phone number already exists.": "توجد زائرة مسجّلة بهذا الرقم.",
  "Already in use": "مستخدم مسبقًا",
  "This patient signs in with her phone number, so it can't be changed here.":
    "تسجّل هذه الزائرة الدخول برقم جوالها، لذلك لا يمكن تغييره من هنا.",
  "Linked to the patient's portal login": "مرتبط بحساب الزائرة في البوابة",
  "Type at least 2 characters": "اكتب حرفين على الأقل",

  // Appointments
  "Choose a time": "اختر الوقت",
  "Choose a reason for your visit": "اختاري سبب الزيارة",
  "Choose a visit reason": "اختر سبب الزيارة",
  "Please describe the reason": "يرجى وصف السبب",
  "Describe the visit reason": "صف سبب الزيارة",
  "Please describe the reason for the visit": "يرجى وصف سبب الزيارة",
  "Please describe the reason for your visit": "يرجى وصف سبب زيارتك",
  "Select a patient": "اختر الزائرة",
  "Appointment not found": "لم يتم العثور على الموعد",
  "This time slot is no longer available.": "هذا الموعد لم يعد متاحًا.",
  "This time is no longer available. Please choose another.": "هذا الوقت لم يعد متاحًا. يرجى اختيار وقت آخر.",
  "This time is outside the clinic's working hours": "هذا الوقت خارج ساعات عمل العيادة",
  "This patient already has an appointment on this day.": "لدى هذه الزائرة موعد في هذا اليوم.",
  "This patient already has an appointment on this day": "لدى هذه الزائرة موعد في هذا اليوم",
  "You already have an appointment on this day. Cancel it first to choose another time.":
    "لديكِ موعد في هذا اليوم. ألغيه أولًا لاختيار وقت آخر.",
  "This appointment can no longer be cancelled online. Please contact the clinic.":
    "لم يعد بالإمكان إلغاء هذا الموعد عبر الإنترنت. يرجى التواصل مع العيادة.",
  "Only scheduled appointments can be cancelled here. Checked-in patients are managed from the queue.":
    "يمكن إلغاء المواعيد المجدولة فقط من هنا. تتم إدارة الزائرات الحاضرات من قائمة الانتظار.",
  "Only today's appointments can be checked in": "يمكن تسجيل حضور مواعيد اليوم فقط",
  "This appointment is not waiting for check-in": "هذا الموعد لا ينتظر تسجيل الحضور",
  "No queue entry found for this appointment": "لا يوجد دور مرتبط بهذا الموعد",
  "Patient is already checked in": "تم تسجيل حضور الزائرة مسبقًا",
  "Only verified patients can book appointments": "يمكن للزائرات الموثّقات فقط حجز المواعيد",
  "Patient account required": "يلزم حساب زائرة",
  "Sign in to view availability": "سجّلي الدخول لعرض المواعيد المتاحة",

  // Queue
  "Only active clinic staff can manage the queue": "يمكن لطاقم العيادة النشط فقط إدارة قائمة الانتظار",
  "Queue entry not found": "لم يتم العثور على الدور",
  "Another consultation is already in progress.": "هناك كشف آخر قيد التنفيذ.",
  "Another patient is already marked as next.": "هناك زائرة أخرى محددة كالتالية.",
  "This patient is already in today's queue.": "هذه الزائرة موجودة في قائمة انتظار اليوم.",
  "Finish the consultation instead of cancelling it": "أنهِ الكشف بدلًا من إلغائه",
  "Finish the current consultation first": "أنهِ الكشف الحالي أولًا",
  "Only a waiting patient can be marked late": "يمكن تحديد الزائرة المنتظرة فقط كمتأخرة",
  "Only a waiting patient who is present can be marked ready": "يمكن تحديد الزائرة المنتظرة الحاضرة فقط كجاهزة",
  "Only the Ready patient can be marked absent": "يمكن تحديد الزائرة الجاهزة فقط كغائبة",
  "Only the current consultation can be finished": "يمكن إنهاء الكشف الحالي فقط",
  "Only waiting patients can be reordered": "يمكن إعادة ترتيب الزائرات المنتظرات فقط",
  "This patient cannot start a consultation now": "لا يمكن بدء كشف هذه الزائرة الآن",
  "This patient was updated by someone else. Refresh and try again.": "تم تحديث بيانات هذه الزائرة من قبل شخص آخر. حدّث الصفحة وحاول مجددًا.",
  "Duration must be between 5 and 180 minutes": "يجب أن تكون المدة بين 5 و180 دقيقة",
  "Enter a duration in minutes": "أدخل المدة بالدقائق",
  "Minimum 5 minutes": "5 دقائق على الأقل",
  "Maximum 180 minutes": "180 دقيقة كحد أقصى",

  // Settings / staff
  "Only the doctor can change working hours": "يمكن للطبيب فقط تغيير ساعات العمل",
  "Only the doctor can change clinic settings.": "يمكن للطبيب فقط تغيير إعدادات العيادة.",
  "Invalid working hours": "ساعات عمل غير صالحة",
  "Each period must end after it starts": "يجب أن تنتهي كل فترة بعد بدايتها",
  "Two working periods overlap on the same day": "توجد فترتان متداخلتان في اليوم نفسه",
  "End time must be after start time": "يجب أن يكون وقت النهاية بعد وقت البداية",
  "Overlaps with another period on this day": "تتداخل مع فترة أخرى في هذا اليوم",
  "Use HH:MM": "استخدم الصيغة HH:MM",
  "Enter the clinic name": "أدخل اسم العيادة",
  "Enter the Arabic name": "أدخل الاسم بالعربية",
  "Enter the doctor's display name": "أدخل اسم الطبيب الظاهر",
  "Secretary not found.": "لم يتم العثور على السكرتيرة.",
  "An account with this email already exists.": "يوجد حساب بهذا البريد الإلكتروني.",
  "Could not create the account. Please try again.": "تعذّر إنشاء الحساب. يرجى المحاولة مرة أخرى.",
  "Could not reset the password. Please try again.": "تعذّر إعادة تعيين كلمة المرور. يرجى المحاولة مرة أخرى.",
  "Status saved, but sign-in access could not be updated. Please try again.":
    "تم حفظ الحالة، لكن تعذّر تحديث صلاحية الدخول. يرجى المحاولة مرة أخرى.",
  "The doctor account cannot be demoted or deactivated": "لا يمكن تخفيض صلاحية حساب الطبيب أو إيقافه",
  "Not allowed to change role or activation status": "غير مسموح بتغيير الدور أو حالة التفعيل",
  "Patients may only update name, email and date of birth": "يمكن للزائرات تعديل الاسم والبريد وتاريخ الميلاد فقط",

  "Paste a link that starts with https://": "الصق رابطًا يبدأ بـ https://",

  // Names (P1-07)
  "Enter the full name in Arabic": "أدخل الاسم الكامل بالعربية",
  "Write the name in Arabic letters only": "اكتب الاسم بحروف عربية فقط",
  "Enter the full triple name: first, father's and family name": "أدخل الاسم الثلاثي: الاسم الأول واسم الأب واسم العائلة",
  "Write the English name in English letters only": "اكتب الاسم الإنجليزي بحروف إنجليزية فقط",

  // Reception portal activation
  "Enter the visitor's full name": "أدخل الاسم الكامل للزائرة",
  "Registration not found. Send a new code.": "لم يتم العثور على التسجيل. أرسل رمزًا جديدًا.",
  "Not verified yet. Ask the visitor to send the code from her WhatsApp, then try again.":
    "لم يتم التحقق بعد. اطلب من الزائرة إرسال الرمز من واتساب ثم حاول مجددًا.",
  "Could not set the password": "تعذّر تعيين كلمة المرور",

  // WhatsApp
  "WhatsApp is not configured.": "لم يتم إعداد واتساب.",
  "This patient has no WhatsApp reminders enabled.": "التذكيرات عبر واتساب غير مفعّلة لهذه الزائرة.",
};

const PATTERNS: Array<[RegExp, (...groups: string[]) => string]> = [
  [/^Please wait (\d+) seconds before requesting a new code\.$/, (s) => `يرجى الانتظار ${s} ثانية قبل طلب رمز جديد.`],
  [/^Incorrect code\. (\d+) attempts? left\.$/, (n) => `رمز غير صحيح. تبقّى ${n} من المحاولات.`],
  [/^Enter a valid mobile number, e\.g\. .+$/, () => "أدخل رقم جوال صالحًا"],
  [/^Appointments can be cancelled online up to (\d+) hours before\. Please call the clinic\.$/, (h) =>
    `يمكن إلغاء المواعيد عبر الإنترنت قبل ${h} ساعات على الأقل. يرجى الاتصال بالعيادة.`],
  [/^The clinic is not open on (.+)$/, (d) => `العيادة مغلقة يوم ${d}`],
  [/^The clinic session for (.+) is closed$/, (d) => `تم إغلاق جلسة العيادة ليوم ${d}`],
  [/^This patient is already in today's queue \(#(\d+)\)$/, (n) => `هذه الزائرة موجودة في قائمة انتظار اليوم (رقم ${n})`],
  [/^This visit is already (\w+)$/, () => "تم تحديث حالة هذه الزيارة مسبقًا"],
  [/^Invalid IANA timezone: (.+)$/, (z) => `منطقة زمنية غير صالحة: ${z}`],
  [/^Invalid phone number: .+$/, () => "رقم هاتف غير صالح"],
  [/^String must contain at most (\d+) character\(s\)$/, (n) => `${n} حرفًا كحد أقصى`],
  [/^String must contain at least (\d+) character\(s\)$/, (n) => `${n} أحرف على الأقل`],
  [/^Required$/, () => "مطلوب"],
  [/^Expected number, received nan$/, () => "أدخل رقمًا"],
  [/^Number must be greater than or equal to (\d+)$/, (n) => `يجب ألا يقل عن ${n}`],
  [/^Number must be less than or equal to (\d+)$/, (n) => `يجب ألا يزيد عن ${n}`],
];

export function localizeServerText(text: string, locale: Locale): string {
  if (locale === "en" || !text) return text;
  const exact = EXACT[text];
  if (exact) return exact;
  for (const [pattern, render] of PATTERNS) {
    const match = pattern.exec(text);
    if (match) return render(...match.slice(1));
  }
  return text;
}

export function localizeFieldErrors<T extends Record<string, string[] | string | undefined>>(errors: T, locale: Locale): T {
  if (locale === "en") return errors;
  return Object.fromEntries(
    Object.entries(errors).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map((v) => localizeServerText(v, locale)) : value ? localizeServerText(value, locale) : value,
    ]),
  ) as T;
}
