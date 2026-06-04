// AUTO-GENERATED — run `npm run sync-schema` to update
// Last synced: 2026-06-04T08:35:06.414Z
// Source: Airtable metadata API (no student data)
//
// USAGE: import { SCHEMA } from '@/lib/airtable-schema'
// Then use SCHEMA.Students.fields['Student Name'].type etc.

export const SCHEMA = {
  "Students": {
    "tableId": "tblLsUETzGNwnSyMx",
    "fields": {
      "Student Name": {
        "type": "singleLineText"
      },
      "Level": {
        "type": "singleSelect",
        "options": [
          "Sec 1",
          "Sec 2",
          "Sec 3",
          "Sec 4",
          "Sec 5",
          "JC1",
          "JC2"
        ]
      },
      "Subject Level": {
        "type": "singleSelect",
        "options": [
          "G1",
          "G2",
          "G3",
          "IP",
          "H1",
          "H2"
        ]
      },
      "Subjects": {
        "type": "multipleSelects",
        "options": [
          "Math",
          "E Math",
          "A Math",
          "IP Math",
          "H1 Math",
          "H2 Math"
        ]
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "Trial",
          "Active",
          "Inactive"
        ]
      },
      "Student Contact": {
        "type": "phoneNumber"
      },
      "Parent Name": {
        "type": "singleLineText"
      },
      "Parent Contact": {
        "type": "phoneNumber"
      },
      "Parent Email": {
        "type": "email"
      },
      "Student Telegram ID": {
        "type": "singleLineText"
      },
      "Parent Telegram ID": {
        "type": "singleLineText"
      },
      "Join Date": {
        "type": "date"
      },
      "How Heard": {
        "type": "singleSelect",
        "options": [
          "Referral",
          "Google Search",
          "Social Media",
          "Walked Past",
          "School Friend",
          "Others"
        ]
      },
      "Referral Type": {
        "type": "singleSelect",
        "options": [
          "Current Student",
          "Past Student",
          "Parent",
          "Other"
        ]
      },
      "Referred By Name": {
        "type": "singleLineText"
      },
      "Referral Cash Paid": {
        "type": "checkbox"
      },
      "School": {
        "type": "singleLineText"
      },
      "Notes": {
        "type": "multilineText"
      },
      "Lessons": {
        "type": "multipleRecordLinks",
        "linkedTable": "Lessons"
      },
      "Enrollments": {
        "type": "multipleRecordLinks",
        "linkedTable": "Enrollments"
      },
      "Rate History": {
        "type": "multipleRecordLinks",
        "linkedTable": "Rate History"
      },
      "Tokens": {
        "type": "multipleRecordLinks",
        "linkedTable": "Tokens"
      },
      "Invoices": {
        "type": "multipleRecordLinks",
        "linkedTable": "Invoices"
      },
      "Questions": {
        "type": "multipleRecordLinks",
        "linkedTable": "Questions"
      },
      "Payment Alias": {
        "type": "singleLineText"
      },
      "Referral Reward Applied": {
        "type": "checkbox"
      },
      "Exams": {
        "type": "multipleRecordLinks",
        "linkedTable": "Exams"
      },
      "Submissions": {
        "type": "singleLineText"
      },
      "Submissions 2": {
        "type": "multipleRecordLinks",
        "linkedTable": "Submissions"
      },
      "Batches": {
        "type": "multipleRecordLinks",
        "linkedTable": "Batches"
      },
      "June Revision 2026": {
        "type": "singleSelect",
        "options": [
          "No Response",
          "Signed Up",
          "Opted Out"
        ]
      }
    }
  },
  "Slots": {
    "tableId": "tblBtOA03UJXhE9dv",
    "fields": {
      "Slot Name": {
        "type": "formula"
      },
      "Day": {
        "type": "singleSelect",
        "options": [
          "1 Monday",
          "2 Tuesday",
          "3 Wednesday",
          "4 Thursday",
          "5 Friday",
          "6 Saturday",
          "7 Sunday"
        ]
      },
      "Time": {
        "type": "singleSelect",
        "options": [
          "9-11am",
          "11am-1pm",
          "1-3pm",
          "3-5pm",
          "5-7pm",
          "7-9pm"
        ]
      },
      "Level": {
        "type": "singleSelect",
        "options": [
          "Secondary",
          "JC",
          "Adhoc"
        ]
      },
      "Normal Capacity": {
        "type": "number"
      },
      "Makeup Capacity": {
        "type": "number"
      },
      "Is Active": {
        "type": "checkbox"
      },
      "Lessons": {
        "type": "multipleRecordLinks",
        "linkedTable": "Lessons"
      },
      "Enrollments": {
        "type": "multipleRecordLinks",
        "linkedTable": "Enrollments"
      },
      "Enrolled Count": {
        "type": "count"
      },
      "Is Full": {
        "type": "formula"
      },
      "Spots Remaining": {
        "type": "formula"
      },
      "Invoices": {
        "type": "singleLineText"
      },
      "Waitlist": {
        "type": "multipleRecordLinks",
        "linkedTable": "Waitlist"
      }
    }
  },
  "Enrollments": {
    "tableId": "tblKZv9RYyjJU64V0",
    "fields": {
      "Enrollment ID": {
        "type": "formula"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Slot": {
        "type": "multipleRecordLinks",
        "linkedTable": "Slots"
      },
      "Subjects In This Slot": {
        "type": "multipleSelects",
        "options": [
          "Math",
          "E Math",
          "A Math",
          "IP Math",
          "H1 Math",
          "H2 Math"
        ]
      },
      "Rate Per Lesson": {
        "type": "currency"
      },
      "Rate Type": {
        "type": "singleSelect",
        "options": [
          "Current",
          "Grandfathered"
        ]
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "Active",
          "Ended"
        ]
      },
      "Start Date": {
        "type": "date"
      },
      "End Date": {
        "type": "date"
      }
    }
  },
  "Rates": {
    "tableId": "tblzm2rzjqTVloaAO",
    "fields": {
      "Rate Name": {
        "type": "singleLineText"
      },
      "Level": {
        "type": "singleSelect",
        "options": [
          "Secondary",
          "JC"
        ]
      },
      "Amount": {
        "type": "currency"
      },
      "Is Current": {
        "type": "checkbox"
      },
      "Effective From": {
        "type": "date"
      },
      "Effective To": {
        "type": "date"
      },
      "Rate History": {
        "type": "multipleRecordLinks",
        "linkedTable": "Rate History"
      }
    }
  },
  "Rate History": {
    "tableId": "tbleaSjRRl4SO8P1R",
    "fields": {
      "Record Name": {
        "type": "formula"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Rate": {
        "type": "multipleRecordLinks",
        "linkedTable": "Rates"
      },
      "Amount": {
        "type": "multipleLookupValues"
      },
      "Effective From": {
        "type": "date"
      },
      "Effective To": {
        "type": "date"
      },
      "Notes": {
        "type": "multilineText"
      }
    }
  },
  "Lessons": {
    "tableId": "tblYT5jhaCqChbSlE",
    "fields": {
      "Lesson ID": {
        "type": "formula"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Level": {
        "type": "multipleLookupValues"
      },
      "Slot": {
        "type": "multipleRecordLinks",
        "linkedTable": "Slots"
      },
      "Date": {
        "type": "date"
      },
      "Type": {
        "type": "singleSelect",
        "options": [
          "Regular",
          "Rescheduled",
          "Additional",
          "Trial",
          "Revision Sprint"
        ]
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "Scheduled",
          "Completed",
          "Absent",
          "Rescheduled",
          "Cancelled",
          "Cancelled - Prorated"
        ]
      },
      "Rescheduled Lesson ID": {
        "type": "multipleRecordLinks",
        "linkedTable": "Lessons"
      },
      "Notes": {
        "type": "multilineText"
      },
      "Rescheduled To Date": {
        "type": "multipleLookupValues"
      },
      "Rescheduled Pair": {
        "type": "singleSelect",
        "options": []
      },
      "Rescheduled Slot": {
        "type": "multipleLookupValues"
      },
      "Charge Override": {
        "type": "currency"
      },
      "From field: Rescheduled To": {
        "type": "multipleRecordLinks",
        "linkedTable": "Lessons"
      },
      "Topics Covered": {
        "type": "multilineText"
      },
      "Homework Assigned": {
        "type": "multilineText"
      },
      "Homework Completion": {
        "type": "singleSelect",
        "options": [
          "Not Set",
          "Fully Done",
          "Partially Done",
          "Not Done"
        ]
      },
      "Mastery Ratings": {
        "type": "multilineText"
      },
      "Mood": {
        "type": "singleSelect",
        "options": [
          "😄 Engaged",
          "🙂 Fine",
          "😟 Distracted",
          "😴 Tired",
          "😤 Frustrated"
        ]
      },
      "Lesson Notes": {
        "type": "multilineText"
      },
      "Progress Logged": {
        "type": "checkbox"
      },
      "Topics Free Text": {
        "type": "multilineText"
      },
      "Mastery": {
        "type": "singleSelect",
        "options": [
          "Strong",
          "OK",
          "Slow"
        ]
      },
      "Homework Returned": {
        "type": "singleSelect",
        "options": [
          "Yes",
          "Partial",
          "No"
        ]
      },
      "Homework Returned Reason": {
        "type": "multilineText"
      },
      "Student Level": {
        "type": "multipleLookupValues"
      },
      "Day of Week": {
        "type": "formula"
      },
      "Source Invoice": {
        "type": "multipleRecordLinks",
        "linkedTable": "Invoices"
      }
    }
  },
  "Invoices": {
    "tableId": "tblL1L3L4uyyrXW14",
    "fields": {
      "Invoice ID": {
        "type": "formula"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Month": {
        "type": "singleLineText"
      },
      "Lessons Count": {
        "type": "number"
      },
      "Rate Per Lesson": {
        "type": "currency"
      },
      "Base Amount": {
        "type": "formula"
      },
      "Adjustment Amount": {
        "type": "currency"
      },
      "Adjustment Notes": {
        "type": "multilineText"
      },
      "Final Amount": {
        "type": "currency"
      },
      "Line Items": {
        "type": "multilineText"
      },
      "Auto Notes": {
        "type": "multilineText"
      },
      "Line Items Extra": {
        "type": "multilineText"
      },
      "Invoice Type": {
        "type": "singleSelect",
        "options": [
          "Regular",
          "Enrollment",
          "Revision Sprint"
        ]
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "Draft",
          "Approved",
          "Sent",
          "Paid",
          "Overdue",
          "Voided"
        ]
      },
      "Issue Date": {
        "type": "date"
      },
      "Due Date": {
        "type": "date"
      },
      "Sent At": {
        "type": "dateTime"
      },
      "Is Paid": {
        "type": "checkbox"
      },
      "Amount Paid": {
        "type": "currency"
      },
      "Paid At": {
        "type": "date"
      },
      "PDF URL": {
        "type": "singleLineText"
      },
      "Is First Invoice": {
        "type": "checkbox"
      },
      "Custom Email Message": {
        "type": "multilineText"
      },
      "ProcessedEmails": {
        "type": "multipleRecordLinks",
        "linkedTable": "ProcessedEmails"
      },
      "EmailLog": {
        "type": "multipleRecordLinks",
        "linkedTable": "EmailLog"
      },
      "Lessons": {
        "type": "multipleRecordLinks",
        "linkedTable": "Lessons"
      },
      "Deferred Amount": {
        "type": "currency"
      },
      "Deferred Note": {
        "type": "multilineText"
      },
      "Deferred To Month": {
        "type": "singleLineText"
      },
      "Deferred Applied": {
        "type": "checkbox"
      }
    }
  },
  "Tokens": {
    "tableId": "tblFbEmXunpIqca7j",
    "fields": {
      "Token": {
        "type": "singleLineText"
      },
      "Created At": {
        "type": "dateTime"
      },
      "Expires At": {
        "type": "dateTime"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "Active",
          "Expired"
        ]
      },
      "Student Registered": {
        "type": "checkbox"
      },
      "Parent Registered": {
        "type": "checkbox"
      },
      "Notes": {
        "type": "multilineText"
      }
    }
  },
  "Reminders": {
    "tableId": "tbloxSkVtIAqoPmQV",
    "fields": {
      "Message": {
        "type": "multilineText"
      },
      "Date": {
        "type": "dateTime"
      },
      "Sent": {
        "type": "checkbox"
      }
    }
  },
  "Questions": {
    "tableId": "tblCAEjdXZmlhDTJx",
    "fields": {
      "Question ID": {
        "type": "formula"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Username": {
        "type": "singleLineText"
      },
      "Chat ID": {
        "type": "singleLineText"
      },
      "Timestamp": {
        "type": "dateTime"
      },
      "Image URL": {
        "type": "url"
      },
      "Blob Pathname": {
        "type": "singleLineText"
      },
      "Telegram File ID": {
        "type": "singleLineText"
      },
      "Caption": {
        "type": "singleLineText"
      },
      "AI Response": {
        "type": "multilineText"
      },
      "Model Used": {
        "type": "singleLineText"
      },
      "Tokens In": {
        "type": "number"
      },
      "Tokens Out": {
        "type": "number"
      },
      "Time Taken": {
        "type": "number"
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "New",
          "Kept",
          "Deleted"
        ]
      },
      "Topic": {
        "type": "singleLineText"
      },
      "Difficulty": {
        "type": "singleSelect",
        "options": [
          "Easy",
          "Medium",
          "Hard",
          "Very Hard"
        ]
      },
      "Question Attachments": {
        "type": "multipleAttachments"
      },
      "Confidence": {
        "type": "singleSelect",
        "options": [
          "High",
          "Low"
        ]
      },
      "Rating": {
        "type": "singleSelect",
        "options": [
          "Good",
          "Bad"
        ]
      }
    }
  },
  "DailyStats": {
    "tableId": "tblkHi09s61TUUXFR",
    "fields": {
      "Date": {
        "type": "date"
      },
      "Model": {
        "type": "singleLineText"
      },
      "Questions": {
        "type": "number"
      },
      "Tokens In": {
        "type": "number"
      },
      "Tokens Out": {
        "type": "number"
      },
      "Time Taken": {
        "type": "number"
      },
      "CostLog": {
        "type": "multipleRecordLinks",
        "linkedTable": "CostLog"
      }
    }
  },
  "Notes": {
    "tableId": "tblANduDIShiUczRn",
    "fields": {
      "Topic": {
        "type": "singleLineText"
      },
      "Level": {
        "type": "singleSelect",
        "options": [
          "Sec",
          "JC"
        ]
      },
      "Content": {
        "type": "multilineText"
      },
      "Slug": {
        "type": "singleLineText"
      },
      "Visuals": {
        "type": "multilineText"
      },
      "Generated Content": {
        "type": "multilineText"
      },
      "Subtopics": {
        "type": "multilineText"
      }
    }
  },
  "Formulas": {
    "tableId": "tblp0z31H8pdhEBOj",
    "fields": {
      "Topic": {
        "type": "singleLineText"
      },
      "Level": {
        "type": "singleSelect",
        "options": [
          "AM",
          "EM",
          "JC"
        ]
      },
      "Image URL": {
        "type": "url"
      },
      "Content Telegram": {
        "type": "multilineText"
      },
      "Content Web": {
        "type": "multilineText"
      },
      "Aliases": {
        "type": "singleLineText"
      },
      "Sort Order": {
        "type": "number"
      }
    }
  },
  "Revision": {
    "tableId": "tblh43ywQ1ta2Mt7c",
    "fields": {
      "Topic": {
        "type": "singleLineText"
      },
      "Level": {
        "type": "singleSelect",
        "options": [
          "EM",
          "AM",
          "JC"
        ]
      },
      "Subtopic": {
        "type": "singleLineText"
      },
      "Slug": {
        "type": "singleLineText"
      },
      "Lesson Data": {
        "type": "multilineText"
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "Draft",
          "Published"
        ]
      },
      "Source File": {
        "type": "singleLineText"
      },
      "Created At": {
        "type": "dateTime"
      }
    }
  },
  "Waitlist": {
    "tableId": "tblHyThW2DWq79yms",
    "fields": {
      "Student Name": {
        "type": "singleLineText"
      },
      "Contact": {
        "type": "singleLineText"
      },
      "Parent Contact": {
        "type": "singleLineText"
      },
      "Preferred Slot": {
        "type": "multipleRecordLinks",
        "linkedTable": "Slots"
      },
      "Level": {
        "type": "singleSelect",
        "options": [
          "Secondary",
          "JC"
        ]
      },
      "Subjects": {
        "type": "singleLineText"
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "Waiting",
          "Contacted",
          "Enrolled",
          "Cancelled"
        ]
      },
      "Notes": {
        "type": "multilineText"
      },
      "Added Date": {
        "type": "date"
      },
      "Notified Date": {
        "type": "date"
      }
    }
  },
  "ProcessedEmails": {
    "tableId": "tblbkbIcEq8GaHZd0",
    "fields": {
      "Email ID": {
        "type": "singleLineText"
      },
      "Processed At": {
        "type": "dateTime"
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "confirmed",
          "skipped",
          "non-payment",
          "shown"
        ]
      },
      "Notes": {
        "type": "multilineText"
      },
      "Related Invoice": {
        "type": "multipleRecordLinks",
        "linkedTable": "Invoices"
      }
    }
  },
  "EmailLog": {
    "tableId": "tbluKE8ki6hkKZeUg",
    "fields": {
      "Email ID": {
        "type": "singleLineText"
      },
      "Sent At": {
        "type": "dateTime"
      },
      "Type": {
        "type": "singleSelect",
        "options": [
          "invoice",
          "amended_invoice",
          "receipt",
          "partial_receipt",
          "overpayment_receipt",
          "correction"
        ]
      },
      "To Email": {
        "type": "singleLineText"
      },
      "Subject": {
        "type": "singleLineText"
      },
      "Body HTML": {
        "type": "multilineText"
      },
      "Related Invoice": {
        "type": "multipleRecordLinks",
        "linkedTable": "Invoices"
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "sent",
          "failed"
        ]
      },
      "Error": {
        "type": "multilineText"
      },
      "Resend ID": {
        "type": "singleLineText"
      },
      "PDF URL": {
        "type": "url"
      }
    }
  },
  "Exams": {
    "tableId": "tblycMU4BykzWNiqH",
    "fields": {
      "Name": {
        "type": "autoNumber"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Exam Type": {
        "type": "singleSelect",
        "options": [
          "WA1",
          "WA2",
          "WA3",
          "EOY",
          "Custom"
        ]
      },
      "Custom Name": {
        "type": "singleLineText"
      },
      "Subject": {
        "type": "singleSelect",
        "options": [
          "Math",
          "E Math",
          "A Math",
          "H2 Math"
        ]
      },
      "Exam Date": {
        "type": "date"
      },
      "Tested Topics": {
        "type": "multilineText"
      },
      "Result Score": {
        "type": "number"
      },
      "Result Total": {
        "type": "number"
      },
      "Result Grade": {
        "type": "singleLineText"
      },
      "Result Notes": {
        "type": "multilineText"
      },
      "Created At": {
        "type": "createdTime"
      },
      "Exam Notes": {
        "type": "multilineText"
      },
      "No Exam": {
        "type": "checkbox"
      }
    }
  },
  "Settings": {
    "tableId": "tblAeRenJ1VoJoNmm",
    "fields": {
      "Setting Name": {
        "type": "singleLineText"
      },
      "Value": {
        "type": "multilineText"
      },
      "Notes": {
        "type": "multilineText"
      }
    }
  },
  "Submissions": {
    "tableId": "tblBeuxyafreoHIVZ",
    "fields": {
      "Submission ID": {
        "type": "formula"
      },
      "Chat ID": {
        "type": "singleLineText"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Student Name": {
        "type": "singleLineText"
      },
      "Username": {
        "type": "singleLineText"
      },
      "Timestamp": {
        "type": "dateTime"
      },
      "Question Number": {
        "type": "singleLineText"
      },
      "Question Topic": {
        "type": "singleLineText"
      },
      "Question Level": {
        "type": "singleLineText"
      },
      "Original Photo URL": {
        "type": "url"
      },
      "Annotated Photo URL": {
        "type": "url"
      },
      "Transcription Photo URL": {
        "type": "url"
      },
      "Telegram File ID Original": {
        "type": "singleLineText"
      },
      "Bot Feedback": {
        "type": "multilineText"
      },
      "Bot Marking JSON": {
        "type": "multilineText"
      },
      "Bot Mark Awarded": {
        "type": "number"
      },
      "Bot Mark Max": {
        "type": "number"
      },
      "Student Final Answer": {
        "type": "singleLineText"
      },
      "Correct Final Answer": {
        "type": "singleLineText"
      },
      "Matches Correct": {
        "type": "checkbox"
      },
      "Had Self Correction": {
        "type": "checkbox"
      },
      "Uncertainty Raised": {
        "type": "checkbox"
      },
      "Uncertainty Notes": {
        "type": "multilineText"
      },
      "Model Used": {
        "type": "singleLineText"
      },
      "Tokens In": {
        "type": "number"
      },
      "Tokens Out": {
        "type": "number"
      },
      "Time Taken": {
        "type": "number"
      },
      "Adrian Reviewed": {
        "type": "checkbox"
      },
      "Adrian Override Mark": {
        "type": "number"
      },
      "Adrian Override Notes": {
        "type": "multilineText"
      },
      "Adrian Reviewed At": {
        "type": "dateTime"
      },
      "Batches": {
        "type": "multipleRecordLinks",
        "linkedTable": "Batches"
      },
      "Page Indices": {
        "type": "multilineText"
      },
      "Question Group Label": {
        "type": "singleLineText"
      },
      "Annotated Slice URLs": {
        "type": "multilineText"
      },
      "Source": {
        "type": "singleSelect",
        "options": [
          "telegram",
          "batch_web"
        ]
      }
    }
  },
  "Batches": {
    "tableId": "tblhNxdQu8HOXGo3M",
    "fields": {
      "Batch ID": {
        "type": "singleLineText"
      },
      "Student": {
        "type": "multipleRecordLinks",
        "linkedTable": "Students"
      },
      "Student Name": {
        "type": "singleLineText"
      },
      "Total Pages": {
        "type": "number"
      },
      "Total Questions": {
        "type": "number"
      },
      "Status": {
        "type": "singleSelect",
        "options": [
          "detected",
          "marking",
          "marked",
          "finalized",
          "failed",
          "deleted"
        ]
      },
      "Page Image URLs": {
        "type": "multilineText"
      },
      "Detection JSON": {
        "type": "multilineText"
      },
      "Final PDF URL": {
        "type": "url"
      },
      "Created At": {
        "type": "dateTime"
      },
      "Finalized At": {
        "type": "dateTime"
      },
      "Submissions": {
        "type": "multipleRecordLinks",
        "linkedTable": "Submissions"
      },
      "Amended At": {
        "type": "dateTime"
      }
    }
  },
  "CostLog": {
    "tableId": "tblwjFZmi796ANTM0",
    "fields": {
      "Feature": {
        "type": "singleLineText"
      },
      "Date": {
        "type": "date"
      },
      "Model": {
        "type": "singleLineText"
      },
      "Calls": {
        "type": "number"
      },
      "Input Tokens": {
        "type": "number"
      },
      "Output Tokens": {
        "type": "number"
      },
      "Total Cost USD": {
        "type": "currency"
      },
      "Linked DailyStats": {
        "type": "multipleRecordLinks",
        "linkedTable": "DailyStats"
      },
      "Notes": {
        "type": "multilineText"
      }
    }
  },
  "PrintNotes": {
    "tableId": "tblcBJ7oqipKNB3vl",
    "fields": {
      "Title": {
        "type": "singleLineText"
      },
      "Level": {
        "type": "singleSelect",
        "options": [
          "S1",
          "S2",
          "S3 EM",
          "S3 AM",
          "S4 EM",
          "S4 AM",
          "JC1",
          "JC2",
          "EM",
          "AM",
          "JC"
        ]
      },
      "PDF URL": {
        "type": "url"
      },
      "Blob Pathname": {
        "type": "singleLineText"
      },
      "Uploaded At": {
        "type": "dateTime"
      }
    }
  }
} as const;

// Field name lookup helpers — use these instead of raw strings
export const FIELDS = Object.fromEntries(
  Object.entries(SCHEMA).map(([table, def]) => [
    table,
    Object.fromEntries(Object.keys(def.fields).map(f => [
      f.replace(/[^a-zA-Z0-9]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '').toUpperCase(),
      f
    ]))
  ])
) as Record<string, Record<string, string>>;