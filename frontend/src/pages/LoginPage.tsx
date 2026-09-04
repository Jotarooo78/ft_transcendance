import LoginForm from "../components/LoginForm";

function LoginPage() {
	return (
		<main>
			<header>
				<h1>Log in</h1>

				<p>
					Access your account and continue listening.
				</p>
			</header>

			<LoginForm />
		</main>
	);
}

export default LoginPage;