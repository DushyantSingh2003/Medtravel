import type { MessageTexts } from './types.js';

/** Machine-drafted Arabic; listed in packages/i18n/REVIEW.md until a native reviewer has checked it. */
export const AR: MessageTexts = {
  enquiry_received: {
    title: 'استلمنا استفسارك',
    body: 'مرحباً {patientName}، شكراً لتواصلك مع MedTravel. رقم حالتك هو {caseNumber}. سيتصل بك منسق قريباً.',
  },
  coordinator_assigned: {
    title: 'منسق حالتك هو {coordinatorName}',
    body: 'مرحباً {patientName}، سيتابع {coordinatorName} حالتك رقم {caseNumber}. يمكنك مراسلته على واتساب: {coordinatorWhatsapp}',
  },
  reports_missing: {
    title: 'نحتاج إلى مزيد من التقارير',
    body: 'مرحباً {patientName}، لمتابعة الحالة رقم {caseNumber} يرجى رفع: {missingReports}.',
  },
  reports_received: {
    title: 'وصلت تقاريرك',
    body: 'مرحباً {patientName}، استلمنا تقاريرك الطبية للحالة رقم {caseNumber}. سيراجعها أطباؤنا الآن.',
  },
  opinions_ready: {
    title: 'آراؤك الطبية جاهزة',
    body: 'مرحباً {patientName}، لديك {opinionCount} رأي من المستشفيات جاهز للحالة رقم {caseNumber}. سجّل الدخول لمقارنتها.',
  },
  quote_sent: {
    title: 'عرض السعر جاهز',
    body: 'مرحباً {patientName}، عرض السعر {quoteNumber} للحالة رقم {caseNumber} جاهز. الإجمالي: {total}. سجّل الدخول لمراجعته وقبوله.',
  },
  quote_expiring: {
    title: 'عرض السعر على وشك الانتهاء',
    body: 'مرحباً {patientName}، عرض السعر {quoteNumber} صالح حتى {expiryDate}. يرجى قبوله قبل ذلك للحفاظ على السعر.',
  },
  payment_received: {
    title: 'تم استلام الدفعة',
    body: 'مرحباً {patientName}، استلمنا دفعتك بمبلغ {amount}. الفاتورة {invoiceNumber} مرفقة بحالتك.',
  },
  invitation_letter_ready: {
    title: 'خطاب الدعوة جاهز',
    body: 'مرحباً {patientName}، خطاب الدعوة من {hospitalName} جاهز. يمكنك تنزيله من حالتك.',
  },
  visa_approved: {
    title: 'تمت الموافقة على تأشيرتك',
    body: 'مرحباً {patientName}، خبر سار: تمت الموافقة على تأشيرتك الطبية وهي صالحة حتى {validUntil}.',
  },
  visa_refused: {
    title: 'بخصوص طلب التأشيرة',
    body: 'مرحباً {patientName}، لم تتم الموافقة على طلب التأشيرة. سيتواصل معك {coordinatorName} بخصوص الخطوات التالية.',
  },
  itinerary_confirmed: {
    title: 'تم تأكيد خطة سفرك',
    body: 'مرحباً {patientName}، موعد وصولك {arrivalDate} على الرحلة {flight}. خط سير الرحلة الكامل في حالتك.',
  },
  pickup_24h: {
    title: 'موعد استقبالك في المطار غداً',
    body: 'مرحباً {patientName}، سيقابلك السائق {driverName} ({driverPhone}) في {pickupTime} بسيارة {vehicle}.',
  },
  pickup_2h: {
    title: 'السائق في الطريق إليك',
    body: 'مرحباً {patientName}، سيقابلك السائق {driverName} ({driverPhone}) في {pickupTime} بسيارة {vehicle}.',
  },
  appointment_reminder: {
    title: 'تذكير بالموعد',
    body: 'مرحباً {patientName}، لديك موعد مع {doctorName} في {hospitalName} بتاريخ {appointmentTime}.',
  },
  daily_treatment_update: {
    title: 'تحديث العلاج اليومي',
    body: 'تحديث لأسرة {patientName}: {updateText}',
  },
  discharge_summary_uploaded: {
    title: 'ملخص الخروج متاح',
    body: 'مرحباً {patientName}، رفع {hospitalName} ملخص خروجك. يمكنك قراءته في سجلاتك.',
  },
  followup_teleconsult_reminder: {
    title: 'تذكير باستشارة المتابعة',
    body: 'مرحباً {patientName}، استشارة المتابعة المرئية مع {doctorName} بتاريخ {appointmentTime}.',
  },
  feedback_request: {
    title: 'كيف كانت تجربتك؟',
    body: 'مرحباً {patientName}، نقدّر رأيك. يستغرق دقيقتين: {feedbackLink}',
  },
  new_lead: {
    title: 'عميل محتمل جديد: {leadName}',
    body: 'وصل استفسار جديد من {country} عن {treatment} (الحالة {caseNumber}).',
  },
  sla_breach: {
    title: 'تجاوز مهلة الخدمة في {caseNumber}',
    body: 'مرّت مهلة {slaName} للحالة {caseNumber} منذ {overdueBy}.',
  },
  hospital_response_overdue: {
    title: 'تأخر رد المستشفى',
    body: 'لم يرد {hospitalName} على الحالة {caseNumber}؛ كان الموعد {dueDate}.',
  },
  bill_over_estimate: {
    title: 'الفاتورة أعلى من التقدير',
    body: 'الحالة {caseNumber}: الفاتورة {actual} وهي أعلى من التقدير {estimate}.',
  },
  arrival_tomorrow: {
    title: 'وصول غداً: {patientName}',
    body: 'يصل {patientName} (الحالة {caseNumber}) غداً الساعة {arrivalTime} على الرحلة {flight}.',
  },
  incident_logged: {
    title: 'حادثة جديدة ({severity})',
    body: 'هناك حادثة جديدة تحتاج إلى اهتمام. افتح قائمة الحوادث أو سجل التدقيق لمعرفة التفاصيل.',
  },
  payment_failed: {
    title: 'فشلت الدفعة',
    body: 'فشلت دفعة بمبلغ {amount} للحالة {caseNumber}: {reason}.',
  },
  referral_stage_changed: {
    title: 'تحديث الإحالة',
    body: 'انتقلت إحالتك {patientInitials} (الحالة {caseNumber}) إلى: {stage}.',
  },
  commission_earned: {
    title: 'تم كسب عمولة',
    body: 'كسبت عمولة بمبلغ {amount} على الحالة {caseNumber}.',
  },
  payout_sent: {
    title: 'تم إرسال الدفعة',
    body: 'تم إرسال دفعة بمبلغ {amount} إليك. المرجع: {reference}.',
  },
  document_quarantined: {
    title: 'تعذّر قبول ملف',
    body: 'لم يجتز ملف رفعته فحص الأمان وتمت إزالته. يرجى التحقق منه ورفعه مرة أخرى.',
  },
  test_event: {
    title: 'إشعار تجريبي',
    body: 'مرحباً {name}، هذه رسالة تجريبية من MedTravel. إذا استطعت قراءتها فهذه القناة تعمل.',
  },
};
