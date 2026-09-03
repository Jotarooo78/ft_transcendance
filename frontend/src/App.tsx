// import { useState, type SubmitEvent } from "react";
// import { 
//   registerUser,
//   type RegisteredUser,
// } from "./services/auth";;
// import "./App.css";

// type RegisterForm = {
//   displayName: string;
//   email: string;
//   password: string;
//   passwordConfirmation: string;
//   accountType: "listener" | "artist";
// };

// function App() {
//   const [form, setForm] = useState<RegisterForm>({
//     displayName: "",
//     email: "",
//     password: "",
//     passwordConfirmation: "",
//     accountType: "listener",
//   });

//   const [isSubmitting, setIsSubmitting] = useState(false);

//   const [errorMessage, setErrorMessage] = useState("");

//   const [RegisteredUser, setRegisteredUser] =
//     useState<RegisteredUser | null>(null);

//   // function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
//   //   event.preventDefault();

//   //   console.log(form);
//   // }
//   async function handleSubmit(
//     event: SubmitEvent<HTMLFormElement>,
//   ) {
//     event.preventDefault();

//     setErrorMessage("");
//     setRegisteredUser(null);

//     if (form.password !== form.passwordConfirmation) {
//       setErrorMessage("Passwords do not match.");
//       return;
//     }

//     if (form.password.length < 12) {
//       setErrorMessage(
//         "Password must contain at least 12 characters.",
//       );
//       return;
//     }

//     setIsSubmitting(true);
    
//     try {
//       const user = await registerUser({
//         displayName: form.displayName.trim(),
//         email: form.email.trim().toLowerCase(),
//         password: form.password,
//         accountType: form.accountType,
//       });
      
//       setRegisteredUser(user);
//     } catch (error) {
//       if (error instanceof Error) {
//         setErrorMessage(error.message);
//       } else {
//         setErrorMessage("An unexpected error occurred.");
//       }
//     } finally {
//       setIsSubmitting(false);
//     }
//   }


//   return (
//     <main>
//       <h1>Create your account</h1>

//       <form onSubmit={handleSubmit}>
//         <label>
//           Display name
//           <input
//             type="text"
//             required
//             minLength={2}
//             maxLength={100}
//             autoComplete="name"
//             value={form.displayName}
//             onChange={(event) => {
//               setForm({
//                 ...form,
//                 displayName: event.target.value,
//               });
//             }}
//           />
//         </label>

//         <label>
//           Email
//           <input
//             type="email"
//             required
//             autoComplete="email"
//             value={form.email}
//             onChange={(event) => {
//               setForm({
//                 ...form,
//                 email: event.target.value,
//               });
//             }}
//           />
//         </label>

//         <label>
//           Password
//           <input
//             type="password"
//             required
//             minLength={12}
//             maxLength={128}
//             autoComplete="new-password"
//             value={form.password}
//             onChange={(event) => {
//               setForm({
//                 ...form,
//                 password: event.target.value,
//               });
//             }}
//           />
//         </label>

//         <label>
//           Confirm password
//           <input
//             type="password"
//             required
//             minLength={12}
//             autoComplete="new-password"
//             value={form.passwordConfirmation}
//             onChange={(event) => {
//               setForm({
//                 ...form,
//                 passwordConfirmation: event.target.value,
//               });
//             }}
//           />
//         </label>

//         <label>
//           Account type
//           <select
//             value={form.accountType}
//             required
//             onChange={(event) => {
//               setForm({
//                 ...form,
//                 accountType: event.target.value as
//                   | "listener"
//                   | "artist",
//               });
//             }}
//           >
//             <option value="listener">Listener</option>
//             <option value="artist">Artist</option>
//           </select>
//         </label>

//         <button
//           type="submit"
//           disabled={isSubmitting}
//         >
//           {isSubmitting
//             ? "Creating account..."
//           : "Create account"}
//         </button>
//       </form>

//       {errorMessage && (
//         <p className="message error-message" role="alert">
//           {errorMessage}
//         </p>
//       )}

//       {RegisteredUser && (
//         <section
//           className="message success-message"
//           aria-live="polite"
//         >
//           <h2>Account created</h2>

//           <p>
//             Welcome, {RegisteredUser?.displayName} !
//           </p>

//           <dl>
//             <div>
//               <dt>Account type</dt>
//               <dd>{RegisteredUser?.accountType}</dd>
//             </div>
//           </dl>
//         </section>
//       )}

//     </main>
//   );
// }

// export default App;
import RegisterPage from "./pages/RegisterPage";
import "./App.css";

function App() {
  return <RegisterPage />;
}

export default App;