import { GRIEVANCE_EMAIL } from '../data/legal'
import { LegalPage } from './LegalPage'

/**
 * Written against what this app actually stores, rather than from a template.
 * A generic policy describes data we do not collect and misses what we do,
 * which is worse than none — see docs/consent-and-policies.md §9.
 *
 * Needs a lawyer's review before it is relied on.
 */
export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Quickplan is a personal planner: tasks, reminders, and money you track alone or
        split with people you know. This says what we hold, why, and who can see it.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account</strong> — name, email address, and a password we never store in readable form.</li>
        <li><strong>What you record</strong> — tasks, reminders, expenses, budgets, recurring schedules and planning figures, including the income you enter.</li>
        <li><strong>Groups</strong> — who is in them, what was spent, who owes whom, and payments recorded between members.</li>
        <li><strong>A UPI ID, if you save one</strong> — so people who owe you can pay you back.</li>
        <li><strong>Notification permission</strong>, if you turn on reminders on a device.</li>
      </ul>

      <h2>Voice input</h2>
      <div className="legal-callout">
        <p>
          When you speak to Quickplan, the recording is handled by <strong>your browser's own
          speech service</strong> — in Chrome, that means the audio is sent to Google to be
          turned into text. It does not stay on your device, and it is not ours to control.
        </p>
        <p>
          <strong>We never receive or store the audio.</strong> Only the text that comes back,
          and only if it becomes something you save.
        </p>
      </div>

      <h2>Who else sees your data</h2>
      <p>
        Nothing you record alone is visible to anyone else. Inside a group, the other members
        see the expenses, the balances, your name, and any UPI ID you have saved — that is
        what a shared ledger is. Leaving a group does not withdraw what was already recorded
        there, because other people's balances depend on it.
      </p>
      <p>
        We do not sell anything, and we do not run advertising or third-party analytics.
        The services we rely on to operate — hosting, our database, and the provider that
        sends verification and password emails — handle data only to do that job.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as your account exists. Delete your account and your own records go with
        it, along with your name and email. <strong>Group expenses and settlements remain</strong>,
        shown against “Removed user” — deleting them would silently change what other people
        are owed.
      </p>

      <h2>Your rights</h2>
      <p>Under India's Digital Personal Data Protection Act, 2023, you can:</p>
      <ul>
        <li>ask what we hold about you, and get a copy;</li>
        <li>correct anything wrong — most of it you can edit yourself;</li>
        <li>delete your account, from Settings, at any time;</li>
        <li>withdraw consent, which means closing the account, since the service is the processing.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Everything travels over HTTPS. Passwords are hashed. Changing or resetting a password
        signs out every device, including the one that did it.
      </p>

      <h2>Children</h2>
      <p>
        Quickplan is for people aged 18 and over, which is why we ask you to confirm it when
        you sign up. If you believe a child has created an account, write to us and we will
        remove it.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that matters, we will ask you to read and accept it
        the next time you open the app rather than changing it quietly.
      </p>

      <h2>Contact</h2>
      <p>
        For any privacy question, correction, or complaint: <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a>.
      </p>

      <p className="legal-foot">
        Questions about this policy are answered at the address above.
      </p>
    </LegalPage>
  )
}
