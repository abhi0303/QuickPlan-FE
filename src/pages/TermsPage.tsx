import { GRIEVANCE_EMAIL } from '../data/legal'
import { LegalPage } from './LegalPage'

/** See the note in PrivacyPage: written for this app, needs a lawyer's review. */
export function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        These are the terms for using Quickplan. Creating an account means agreeing to them.
      </p>

      <h2>Who can use it</h2>
      <p>
        You need to be 18 or older, and the details you sign up with need to be your own and
        accurate. One account per person.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password to yourself. Anything done through your account is treated as done
        by you, so tell us at once if you think somebody else has access.
      </p>

      <h2>What Quickplan is, and is not</h2>
      <div className="legal-callout">
        <p>
          Quickplan is a <strong>record of what you tell it</strong>. It is not a bank, a
          payment service, or financial advice, and it never moves money.
        </p>
        <p>
          When you settle up, Quickplan hands your UPI app the payee and the amount — the
          payment happens between you and them, through their app and their bank. Nothing
          reports back, so a settlement is recorded because <strong>you say it happened</strong>.
          Balances are only ever as right as what people record.
        </p>
      </div>

      <h2>Money between people</h2>
      <p>
        Debts shown in a group are between the people in it. If somebody disputes a figure,
        settle it between yourselves — we have no way to arbitrate, and we will not take sides
        or reverse a record on one person's word.
      </p>

      <h2>What you may not do</h2>
      <ul>
        <li>Use somebody else's account, or add people who have not agreed to be added.</li>
        <li>Use Quickplan for anything unlawful.</li>
        <li>Attempt to break, overload, or extract data from the service.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        Quickplan is offered as it is. We try to keep it running and to keep your data safe,
        but we do not promise it will always be available or free of faults. Keep your own
        record of anything you cannot afford to lose.
      </p>

      <h2>Ending it</h2>
      <p>
        You can delete your account from Settings at any time. We may close an account that
        breaks these terms. Either way, records inside shared groups remain for the other
        members — see the <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change materially, we will ask you to read and accept the new ones
        before you carry on using the app.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a>
      </p>

      <p className="legal-foot">
        Governed by the laws of India.
      </p>
    </LegalPage>
  )
}
