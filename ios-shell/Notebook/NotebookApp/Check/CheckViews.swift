import SwiftUI

/// Sign in with the same email and password as the website.
struct SignInSheet: View {
    let account: StudentAccount
    var onSignedIn: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("signInEmail")
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .accessibilityIdentifier("signInPassword")
                } footer: {
                    Text("Use the same email and password as the website.")
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Sign In to Check Pages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Sign In") { Task { await signIn() } }
                            .disabled(email.isEmpty || password.isEmpty)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func signIn() async {
        busy = true
        defer { busy = false }
        do {
            try await account.signIn(email: email, password: password)
            dismiss()
            onSignedIn()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// "What went wrong": the verdict first, then each question in a few plain lines.
struct CheckResultSheet: View {
    let check: PageCheck
    var onClear: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label(check.summary, systemImage: icon(check.verdict))
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(color(check.verdict))
                        .accessibilityIdentifier("checkSummary")
                }
                ForEach(check.questions) { q in
                    Section(q.label) {
                        Label(title(q.verdict), systemImage: icon(q.verdict))
                            .foregroundStyle(color(q.verdict))
                            .font(.headline)
                        if !q.wrong.isEmpty { Text(q.wrong) }
                        if !q.fix.isEmpty {
                            Text(q.fix).foregroundStyle(.secondary)
                        }
                        if !q.answer.isEmpty && q.verdict != .correct {
                            Text("**Answer:** \(q.answer)")
                        }
                    }
                }
                Section {
                    Button(role: .destructive) { onClear(); dismiss() } label: { Text("Clear Red Pen") }
                }
            }
            .navigationTitle("This Page")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func title(_ v: PageCheck.Verdict) -> String {
        switch v {
        case .correct: "Correct"
        case .partial: "Partly right"
        case .wrong: "Not right yet"
        case .unreadable: "Nothing to check"
        }
    }

    private func icon(_ v: PageCheck.Verdict) -> String {
        switch v {
        case .correct: "checkmark.circle.fill"
        case .partial: "exclamationmark.circle.fill"
        case .wrong: "xmark.circle.fill"
        case .unreadable: "questionmark.circle"
        }
    }

    private func color(_ v: PageCheck.Verdict) -> Color {
        switch v {
        case .correct: .green
        case .partial: .orange
        case .wrong: .red
        case .unreadable: .secondary
        }
    }
}
