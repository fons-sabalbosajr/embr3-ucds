# ERMS document upload: User Acceptance Test (UAT)

| | |
|---|---|
| **System** | E-Universe › ERMS (Electronic Records Management System) |
| **Units under test** | Records Unit · Legal Services Unit · Environmental Laboratory |
| **Site** | https://e-universe.embr3-onlinesystems.cloud (live, for testing only) |
| **Version** | 1.0, 26 November 2026 |
| **Goal** | Each unit uploads a sample document, finds it and opens it. When all three units pass, ERMS is accepted as ready. |

## Before you start

**Read this first. The data is real.** The testing site uses the live E-Universe
database and the real NAS shares. What you upload is filed for real and gets a
real serial number.

- Use the **sample document** the Developer gives you. Its first page reads
  **"UAT SAMPLE — NOT A REAL DOCUMENT"**. Do not upload a real permit or case
  file for this test.
- In every text field you fill in, start the value with **`UAT TEST`** (for
  example, Proponent: `UAT TEST Proponent`), so the test record is easy to find
  and remove.
- **Write down every serial number** the system gives you (step 4). The
  Developer removes the test records afterwards using that list.

**Each tester needs:**

- [ ] An E-Universe account of type **ERMS User**, set to your unit (Records, Legal Services or Laboratory)
- [ ] Your unit's storage container shared with your account (Developer: Storage › Access)
- [ ] The sample document: a PDF under 20 MB
- [ ] A second file of a type that is **not** allowed, such as a `.zip` (for test 7)
- [ ] A current Chrome, Edge or Firefox, on a computer or tablet

**The Developer confirms before the session:**

- [ ] Storage › Developer guide › "Right now" shows document access **Open**
- [ ] The activation window does not end during the test period

## How to record results

For each step, compare what happens with **Expected result**, then mark
**Pass** or **Fail**. If anything is different, mark Fail, write what you saw
in **Notes**, take a screenshot, and note the time. Add it to the defect log at
the end.

---

## Part A: Records Unit

Tester: ______________________  Date: ____________

| # | Step | Expected result | Pass / Fail | Notes |
|---|---|---|---|---|
| A1 | Open the site and sign in with your Records account. | You land on the **ERMS Records dashboard**, with no year to choose. | | |
| A2 | Open **Document Library** from the menu. | The list of records loads. | | |
| A3 | Click **Upload record**. | The filing form opens. | | |
| A4 | Fill in the required fields: Proponent, Permit type, Project title, Date approved, Project type, Province (start text values with `UAT TEST`). Under **Scanned documents**, add the sample PDF. Click **Upload record and scan**. | A progress bar runs to the end, then a message confirms the record with its **serial number**. Write it here: ____________ | | |
| A5 | Search the Document Library for the serial number. | Exactly one record is found, with the values you entered. | | |
| A6 | Open the record and open its document. | The sample PDF opens in the viewer, marked **View only**, and its first page reads "UAT SAMPLE". | | |
| A7 | Start a new record, fill in the fields, and try to add the `.zip` file. | The file is refused; only PDF, image, Word and Excel files are accepted. | | |
| A8 | Start a new record, leave **Proponent** empty, and try to save. | The form does not save and shows that Proponent is required. | | |
| A9 | Try to open the Legal Services or Laboratory document library (or its address). | You cannot open the other units' documents. | | |
| A10 | Sign out. | You return to the sign-in page. | | |

## Part B: Legal Services Unit

Tester: ______________________  Date: ____________

| # | Step | Expected result | Pass / Fail | Notes |
|---|---|---|---|---|
| B1 | Open the site and sign in with your Legal Services account. | You land on the **Legal Services dashboard**, with no year to choose. | | |
| B2 | Open **Document Library** from the menu. | The list of Legal Services documents loads. | | |
| B3 | Click **Upload document**. | The upload form opens at its first step. | | |
| B4 | Choose a **Document type** and the **Province**, and fill in the required details for that type (start text values with `UAT TEST`). Note the serial format shown ("assigned on filing"). | The form moves through its steps with **Next**; required fields are marked. | | |
| B5 | At **Upload Document**, add the sample PDF under **Scanned document** and click **Upload document**. | A progress bar runs to the end, then a message confirms the filing with its **serial number**. Write it here: ____________ | | |
| B6 | Find the document in the Document Library by its serial number. | It is listed with the type and province you chose. | | |
| B7 | Open its details, then open the document. | The sample PDF opens, marked **View only**, and its first page reads "UAT SAMPLE". | | |
| B8 | On that document, add the sample PDF again as an attachment (**Upload attachment**). | The attachment is filed against the document and listed under it. Serial: ____________ | | |
| B9 | Start a new upload and try to add the `.zip` file. | The file is refused. | | |
| B10 | Try to open the Records or Laboratory document library (or its address). | You cannot open the other units' documents. | | |
| B11 | Sign out. | You return to the sign-in page. | | |

## Part C: Environmental Laboratory

Tester: ______________________  Date: ____________

| # | Step | Expected result | Pass / Fail | Notes |
|---|---|---|---|---|
| C1 | Open the site and sign in with your Laboratory account. | You land on the **Laboratory dashboard**, with no year to choose. | | |
| C2 | Open **Document Library** from the menu. | The list of Laboratory documents loads. | | |
| C3 | Click **Upload document**. | The upload form opens at its first step. | | |
| C4 | Choose a **Document type** (for example, a test result) and the **Province**, and fill in the required details (start text values with `UAT TEST`). | The form moves through its steps with **Next**; required fields are marked. | | |
| C5 | At **Upload Document**, add the sample PDF under **Scanned document** and click **Upload document**. | A progress bar runs to the end, then a message confirms the filing with its **serial number**. Write it here: ____________ | | |
| C6 | Find the document in the Document Library by its serial number. | It is listed with the type and province you chose. | | |
| C7 | Open its details, then open the document. | The sample PDF opens, marked **View only**, and its first page reads "UAT SAMPLE". | | |
| C8 | Start a new upload and try to add the `.zip` file. | The file is refused. | | |
| C9 | Try to open the Records or Legal Services document library (or its address). | You cannot open the other units' documents. | | |
| C10 | Sign out. | You return to the sign-in page. | | |

## Part D: Developer checks (after Parts A to C)

Developer: ______________________  Date: ____________

| # | Check | Expected result | Pass / Fail | Notes |
|---|---|---|---|---|
| D1 | Admin Settings › **Audit Logs** › **ERMS** tab, filtered to each tester's username. | Each upload appears with the right unit (Records, Legal or Laboratory). | | |
| D2 | **Audit Logs** › **NAS** tab. | Each file written and opened during the test is listed with result **OK**; nothing was refused unexpectedly. | | |
| D3 | Storage › File Explorer, each unit's container. | Each sample file is stored in its unit's container, under its record. | | |
| D4 | Remove every test record listed in the serial numbers above, with its files. | No `UAT TEST` records remain in any Document Library. | | |

---

## Defect log

| # | Unit and step | What happened | Time | Severity (Blocker / Major / Minor) | Fixed in | Retested by / date |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

**Blocker:** a document cannot be uploaded, found or opened, or a unit can see
another unit's documents. **Major:** the step works but is wrong or confusing in
a way that would cause filing mistakes. **Minor:** wording, layout or
appearance.

## Acceptance

ERMS is accepted for a unit when every step in its part passes and no
**Blocker** or **Major** defect is open for it. ERMS is ready when all three
units are accepted and Part D passes.

| Unit | Result (Accepted / Not yet) | Tester | Unit head | Date |
|---|---|---|---|---|
| Records Unit | | | | |
| Legal Services Unit | | | | |
| Environmental Laboratory | | | | |
| Developer checks (Part D) | | | | |

Signed for the Developer: ______________________  Date: ____________
