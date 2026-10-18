/**
 * Textes de la politique de confidentialité et des conditions d'utilisation, dans les trois langues.
 * Ils décrivent le fonctionnement réel de l'application (données stockées, durées, limites) : toute
 * modification de ce fonctionnement doit être reportée ici, puis la date de mise à jour changée.
 */
import type { Language } from "../services/language.ts";

/** Les deux documents accessibles depuis le pied de page. */
export type LegalDocumentId = "privacy" | "terms";

/** Une partie d'un document : un titre, puis des paragraphes et/ou une liste à puces. */
export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

/** Un document complet dans une langue. */
export type LegalDocument = {
  title: string;
  summary: string;
  sections: LegalSection[];
};

/** Date de dernière mise à jour des deux documents (format ISO, affichée selon la langue). */
export const legalUpdatedAt = "2026-10-17";

/** Chaque document doit exister dans chaque langue : le type refuse une traduction manquante. */
export const legalDocuments: Record<
  LegalDocumentId,
  Record<Language, LegalDocument>
> = {
  privacy: {
    en: {
      title: "Privacy Policy",
      summary:
        "This policy explains which personal data FT GoodVibes processes, why it does so, how long the data is kept and how you can exercise your rights.",
      sections: [
        {
          title: "1. Who is responsible for your data",
          paragraphs: [
            "FT GoodVibes is a music upload, streaming and sharing platform built by a team of students as part of the 42 curriculum. It is a free, non-commercial educational project.",
            "The student team that runs this instance, listed in the project README, is responsible for processing your personal data.",
          ],
        },
        {
          title: "2. Data we collect",
          items: [
            "Account: your email address and your password. The password is never stored in clear text; only an Argon2 hash (a salted, one-way fingerprint) is kept.",
            "Profile: your username, display name, optional bio and optional avatar image.",
            "Social features: your list of friends, your online status and the time you were last seen.",
            "Messages: your conversations with friends, the text of your messages (up to 2,000 characters), the tracks you share and the last message you have read in each conversation.",
            "Uploads: the audio files and images you upload, their technical details (format, size, duration, checksum) and the information you publish with them (titles, artist credits, genres, release type, cover).",
            "Library: your playlists, liked tracks, saved projects and followed artists.",
            "Listening: each listening session (track, start time, time listened and progress), used to build your History.",
            "Technical data: the web server and the services keep technical logs, which include the IP address and the requested address, and aggregated metrics such as request counts and response times.",
          ],
        },
        {
          title: "3. Why we use it",
          items: [
            "To provide the service you ask for: create and secure your account, display your profile, deliver your messages, store and stream your music and show your listening history. This processing is necessary to perform these Terms of Service.",
            "To keep the platform secure and available: limit repeated sign-up and login attempts, detect failures and back up the data. This processing relies on our legitimate interest in running a reliable service.",
          ],
          paragraphs: [
            "We do not use your data for advertising, profiling or automated decisions, and we never sell or rent it.",
          ],
        },
        {
          title: "4. Who can see your data",
          items: [
            "Anyone, even without an account: your published tracks and projects, your artist page (display name, username, bio and avatar) and the playlists you make public, through their link.",
            "Signed-in users: your profile in the user directory and your online status.",
            "Your friends: the messages exchanged in your conversations with them and the tracks you share.",
            "Only you: your email address, private playlists, drafts, unpublished uploads and listening history.",
            "The team: technical access for maintenance only.",
          ],
          paragraphs: [
            "No data is sent to third parties. All services and the database run in the project's own containers; FT GoodVibes uses no external analytics, advertising, font or tracking service.",
          ],
        },
        {
          title: "5. Data stored in your browser",
          paragraphs: [
            "FT GoodVibes does not use cookies. It only keeps the following items in your browser, which are strictly necessary for the features and are never used for tracking:",
          ],
          items: [
            "Session storage, erased when the tab is closed: your login token, valid for one hour, and the screen you had open.",
            "Local storage: your language choice and, for each account, the player state (queue, position, volume and playback preferences), restored paused on your next visit.",
          ],
        },
        {
          title: "6. How long we keep it",
          items: [
            "Account, profile, friends, library, uploads and listening history: as long as your account exists.",
            "Temporary uploads that are not used in a publication: deleted automatically after 24 hours.",
            "Deleted messages: hidden immediately for both participants. The message remains stored in the database with its deletion date, but it is never displayed again.",
            "Backups: a copy of the database, audio files and avatars is made every day and each copy is deleted automatically after 7 days.",
            "Login token: expires one hour after sign-in.",
            "Technical logs and metrics: kept only as long as needed to operate and monitor the service.",
          ],
          paragraphs: [
            "As FT GoodVibes is an educational project, the whole instance and its data may be deleted at the end of the project.",
          ],
        },
        {
          title: "7. Security",
          items: [
            "Every connection between your browser and FT GoodVibes uses HTTPS.",
            "Passwords are hashed with Argon2 and are never stored or sent back in clear text.",
            "Each service has its own database account, limited to the operations it actually needs.",
            "Sign-up and login attempts are rate-limited.",
            "Uploaded files are checked for type, size and format, and private files are only served to their owner.",
          ],
        },
        {
          title: "8. Your rights",
          paragraphs: [
            "Under the General Data Protection Regulation (GDPR), you have the right to access, rectify and erase your data, to restrict or object to its processing and to receive it in a portable format.",
            "You can already correct your profile and avatar from the Profile screen and delete your messages, files and playlists yourself. For any other request, such as a copy of your data or the deletion of your account, contact the team that runs this instance; we answer within one month.",
            "If you believe your rights are not respected, you can lodge a complaint with your data protection authority (in France, the CNIL).",
          ],
        },
        {
          title: "9. Minimum age",
          paragraphs: [
            "You must be at least 15 years old to create an account.",
          ],
        },
        {
          title: "10. Changes to this policy",
          paragraphs: [
            "We may update this policy when the application changes. The date at the top of the page shows the latest version.",
          ],
        },
      ],
    },
    fr: {
      title: "Politique de confidentialité",
      summary:
        "Cette politique explique quelles données personnelles FT GoodVibes traite, pour quelles raisons, combien de temps elles sont conservées et comment exercer vos droits.",
      sections: [
        {
          title: "1. Responsable de vos données",
          paragraphs: [
            "FT GoodVibes est une plateforme de publication, d’écoute et de partage de musique créée par une équipe d’étudiants dans le cadre du cursus 42. C’est un projet pédagogique gratuit et non commercial.",
            "L’équipe d’étudiants qui fait fonctionner cette instance, présentée dans le README du projet, est responsable du traitement de vos données personnelles.",
          ],
        },
        {
          title: "2. Données collectées",
          items: [
            "Compte : votre adresse e-mail et votre mot de passe. Le mot de passe n’est jamais conservé en clair ; seule une empreinte Argon2 (salée et irréversible) est gardée.",
            "Profil : votre nom d’utilisateur, votre nom affiché, une biographie et un avatar facultatifs.",
            "Fonctions sociales : votre liste d’amis, votre statut en ligne et l’heure de votre dernière activité.",
            "Messages : vos conversations avec vos amis, le texte de vos messages (2 000 caractères au maximum), les morceaux partagés et le dernier message lu dans chaque conversation.",
            "Publications : les fichiers audio et les images que vous envoyez, leurs caractéristiques techniques (format, taille, durée, somme de contrôle) et les informations publiées avec eux (titres, crédits d’artistes, genres, type de sortie, pochette).",
            "Bibliothèque : vos playlists, morceaux aimés, projets enregistrés et artistes suivis.",
            "Écoute : chaque session d’écoute (morceau, heure de début, temps écouté et progression), utilisée pour votre Historique.",
            "Données techniques : le serveur web et les services conservent des journaux techniques, qui contiennent l’adresse IP et l’adresse demandée, ainsi que des mesures agrégées comme le nombre de requêtes et les temps de réponse.",
          ],
        },
        {
          title: "3. Pourquoi nous les utilisons",
          items: [
            "Pour fournir le service demandé : créer et sécuriser votre compte, afficher votre profil, acheminer vos messages, stocker et diffuser votre musique et présenter votre historique d’écoute. Ce traitement est nécessaire à l’exécution des présentes conditions d’utilisation.",
            "Pour garder la plateforme sûre et disponible : limiter les tentatives répétées d’inscription et de connexion, détecter les pannes et sauvegarder les données. Ce traitement repose sur notre intérêt légitime à faire fonctionner un service fiable.",
          ],
          paragraphs: [
            "Nous n’utilisons pas vos données à des fins publicitaires, de profilage ou de décision automatisée, et nous ne les vendons ni ne les louons jamais.",
          ],
        },
        {
          title: "4. Qui peut voir vos données",
          items: [
            "Tout le monde, même sans compte : vos morceaux et projets publiés, votre page d’artiste (nom affiché, nom d’utilisateur, biographie et avatar) et les playlists que vous rendez publiques, via leur lien.",
            "Les utilisateurs connectés : votre profil dans l’annuaire et votre statut en ligne.",
            "Vos amis : les messages échangés dans vos conversations avec eux et les morceaux que vous partagez.",
            "Vous seul : votre adresse e-mail, vos playlists privées, brouillons, fichiers non publiés et votre historique d’écoute.",
            "L’équipe : un accès technique, uniquement pour la maintenance.",
          ],
          paragraphs: [
            "Aucune donnée n’est transmise à des tiers. Tous les services et la base de données fonctionnent dans les conteneurs du projet ; FT GoodVibes n’utilise aucun service externe de mesure d’audience, de publicité, de polices ou de suivi.",
          ],
        },
        {
          title: "5. Données conservées dans votre navigateur",
          paragraphs: [
            "FT GoodVibes n’utilise pas de cookies. L’application garde uniquement les éléments suivants dans votre navigateur ; ils sont strictement nécessaires aux fonctionnalités et ne servent jamais au suivi :",
          ],
          items: [
            "Stockage de session, effacé à la fermeture de l’onglet : votre jeton de connexion, valable une heure, et l’écran que vous aviez ouvert.",
            "Stockage local : votre choix de langue et, pour chaque compte, l’état du lecteur (file d’attente, position, volume et préférences de lecture), restauré en pause lors de votre prochaine visite.",
          ],
        },
        {
          title: "6. Durées de conservation",
          items: [
            "Compte, profil, amis, bibliothèque, publications et historique d’écoute : tant que votre compte existe.",
            "Envois temporaires non utilisés dans une publication : supprimés automatiquement après 24 heures.",
            "Messages supprimés : masqués immédiatement pour les deux participants. Le message reste enregistré dans la base avec sa date de suppression, mais il n’est plus jamais affiché.",
            "Sauvegardes : une copie de la base de données, des fichiers audio et des avatars est réalisée chaque jour, et chaque copie est supprimée automatiquement après 7 jours.",
            "Jeton de connexion : expire une heure après la connexion.",
            "Journaux et mesures techniques : conservés seulement le temps nécessaire au fonctionnement et à la surveillance du service.",
          ],
          paragraphs: [
            "FT GoodVibes étant un projet pédagogique, l’instance entière et ses données peuvent être supprimées à la fin du projet.",
          ],
        },
        {
          title: "7. Sécurité",
          items: [
            "Toutes les connexions entre votre navigateur et FT GoodVibes utilisent HTTPS.",
            "Les mots de passe sont hachés avec Argon2 et ne sont jamais stockés ni renvoyés en clair.",
            "Chaque service dispose de son propre compte de base de données, limité aux opérations dont il a réellement besoin.",
            "Les tentatives d’inscription et de connexion sont limitées en fréquence.",
            "Les fichiers envoyés sont contrôlés (type, taille, format) et les fichiers privés ne sont servis qu’à leur propriétaire.",
          ],
        },
        {
          title: "8. Vos droits",
          paragraphs: [
            "Conformément au Règlement général sur la protection des données (RGPD), vous disposez d’un droit d’accès, de rectification et d’effacement de vos données, d’un droit à la limitation et d’opposition à leur traitement, ainsi que d’un droit à leur portabilité.",
            "Vous pouvez déjà corriger votre profil et votre avatar depuis l’écran Profil, et supprimer vous-même vos messages, fichiers et playlists. Pour toute autre demande, comme une copie de vos données ou la suppression de votre compte, contactez l’équipe qui fait fonctionner cette instance ; nous répondons sous un mois.",
            "Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à votre autorité de protection des données (en France, la CNIL).",
          ],
        },
        {
          title: "9. Âge minimum",
          paragraphs: [
            "Vous devez avoir au moins 15 ans pour créer un compte.",
          ],
        },
        {
          title: "10. Modifications de cette politique",
          paragraphs: [
            "Cette politique peut être mise à jour lorsque l’application évolue. La date en haut de la page indique la version en vigueur.",
          ],
        },
      ],
    },
    es: {
      title: "Política de privacidad",
      summary:
        "Esta política explica qué datos personales trata FT GoodVibes, con qué fines, durante cuánto tiempo se conservan y cómo puedes ejercer tus derechos.",
      sections: [
        {
          title: "1. Responsable de tus datos",
          paragraphs: [
            "FT GoodVibes es una plataforma para publicar, escuchar y compartir música creada por un equipo de estudiantes en el marco del programa 42. Es un proyecto educativo gratuito y sin fines comerciales.",
            "El equipo de estudiantes que gestiona esta instancia, presentado en el README del proyecto, es responsable del tratamiento de tus datos personales.",
          ],
        },
        {
          title: "2. Datos que recopilamos",
          items: [
            "Cuenta: tu dirección de correo electrónico y tu contraseña. La contraseña nunca se guarda en texto claro; solo se conserva un hash Argon2 (una huella salada e irreversible).",
            "Perfil: tu nombre de usuario, tu nombre visible y, de forma opcional, una biografía y un avatar.",
            "Funciones sociales: tu lista de amigos, tu estado en línea y la hora de tu última actividad.",
            "Mensajes: tus conversaciones con amigos, el texto de tus mensajes (hasta 2000 caracteres), las canciones que compartes y el último mensaje leído en cada conversación.",
            "Publicaciones: los archivos de audio y las imágenes que subes, sus datos técnicos (formato, tamaño, duración, suma de verificación) y la información que publicas con ellos (títulos, créditos de artistas, géneros, tipo de lanzamiento, portada).",
            "Biblioteca: tus playlists, canciones que te gustan, proyectos guardados y artistas seguidos.",
            "Escucha: cada sesión de escucha (canción, hora de inicio, tiempo escuchado y progreso), utilizada para tu Historial.",
            "Datos técnicos: el servidor web y los servicios guardan registros técnicos, que incluyen la dirección IP y la dirección solicitada, y métricas agregadas como el número de peticiones y los tiempos de respuesta.",
          ],
        },
        {
          title: "3. Para qué los usamos",
          items: [
            "Para prestar el servicio que solicitas: crear y proteger tu cuenta, mostrar tu perfil, entregar tus mensajes, almacenar y reproducir tu música y mostrar tu historial de escucha. Este tratamiento es necesario para cumplir estas condiciones de uso.",
            "Para mantener la plataforma segura y disponible: limitar los intentos repetidos de registro e inicio de sesión, detectar fallos y hacer copias de seguridad. Este tratamiento se basa en nuestro interés legítimo en ofrecer un servicio fiable.",
          ],
          paragraphs: [
            "No usamos tus datos con fines publicitarios, de elaboración de perfiles ni de decisiones automatizadas, y nunca los vendemos ni alquilamos.",
          ],
        },
        {
          title: "4. Quién puede ver tus datos",
          items: [
            "Cualquier persona, incluso sin cuenta: tus canciones y proyectos publicados, tu página de artista (nombre visible, nombre de usuario, biografía y avatar) y las playlists que hagas públicas, a través de su enlace.",
            "Los usuarios conectados: tu perfil en el directorio de usuarios y tu estado en línea.",
            "Tus amigos: los mensajes intercambiados en vuestras conversaciones y las canciones que compartes.",
            "Solo tú: tu correo electrónico, tus playlists privadas, borradores, archivos no publicados e historial de escucha.",
            "El equipo: acceso técnico, únicamente para el mantenimiento.",
          ],
          paragraphs: [
            "No se envía ningún dato a terceros. Todos los servicios y la base de datos funcionan en los contenedores del propio proyecto; FT GoodVibes no utiliza servicios externos de analítica, publicidad, fuentes ni seguimiento.",
          ],
        },
        {
          title: "5. Datos guardados en tu navegador",
          paragraphs: [
            "FT GoodVibes no utiliza cookies. Solo guarda en tu navegador los siguientes elementos, estrictamente necesarios para las funciones y nunca usados para el seguimiento:",
          ],
          items: [
            "Almacenamiento de sesión, borrado al cerrar la pestaña: tu token de sesión, válido durante una hora, y la pantalla que tenías abierta.",
            "Almacenamiento local: tu idioma y, para cada cuenta, el estado del reproductor (cola, posición, volumen y preferencias de reproducción), que se restaura en pausa en tu próxima visita.",
          ],
        },
        {
          title: "6. Cuánto tiempo los conservamos",
          items: [
            "Cuenta, perfil, amigos, biblioteca, publicaciones e historial de escucha: mientras exista tu cuenta.",
            "Subidas temporales que no se usan en una publicación: se eliminan automáticamente a las 24 horas.",
            "Mensajes eliminados: se ocultan inmediatamente para ambos participantes. El mensaje sigue guardado en la base de datos con su fecha de eliminación, pero nunca vuelve a mostrarse.",
            "Copias de seguridad: cada día se copia la base de datos, los archivos de audio y los avatares, y cada copia se elimina automáticamente a los 7 días.",
            "Token de sesión: caduca una hora después de iniciar sesión.",
            "Registros y métricas técnicas: se conservan solo el tiempo necesario para operar y supervisar el servicio.",
          ],
          paragraphs: [
            "Como FT GoodVibes es un proyecto educativo, la instancia completa y sus datos pueden eliminarse al final del proyecto.",
          ],
        },
        {
          title: "7. Seguridad",
          items: [
            "Todas las conexiones entre tu navegador y FT GoodVibes usan HTTPS.",
            "Las contraseñas se procesan con Argon2 y nunca se guardan ni se devuelven en texto claro.",
            "Cada servicio tiene su propia cuenta de base de datos, limitada a las operaciones que realmente necesita.",
            "Los intentos de registro e inicio de sesión tienen un límite de frecuencia.",
            "Los archivos subidos se comprueban (tipo, tamaño, formato) y los archivos privados solo se entregan a su propietario.",
          ],
        },
        {
          title: "8. Tus derechos",
          paragraphs: [
            "De acuerdo con el Reglamento General de Protección de Datos (RGPD), tienes derecho a acceder a tus datos, rectificarlos y suprimirlos, a limitar u oponerte a su tratamiento y a recibirlos en un formato portable.",
            "Ya puedes corregir tu perfil y tu avatar desde la pantalla Perfil, y eliminar tú mismo tus mensajes, archivos y playlists. Para cualquier otra solicitud, como una copia de tus datos o la eliminación de tu cuenta, contacta con el equipo que gestiona esta instancia; respondemos en el plazo de un mes.",
            "Si consideras que no se respetan tus derechos, puedes presentar una reclamación ante tu autoridad de protección de datos (en Francia, la CNIL).",
          ],
        },
        {
          title: "9. Edad mínima",
          paragraphs: ["Debes tener al menos 15 años para crear una cuenta."],
        },
        {
          title: "10. Cambios en esta política",
          paragraphs: [
            "Podemos actualizar esta política cuando la aplicación cambie. La fecha en la parte superior de la página indica la versión vigente.",
          ],
        },
      ],
    },
  },
  terms: {
    en: {
      title: "Terms of Service",
      summary:
        "These terms set the rules for using FT GoodVibes. By creating an account or using the service, you accept them.",
      sections: [
        {
          title: "1. The service",
          paragraphs: [
            "FT GoodVibes lets you upload, publish and stream music, organise it in playlists, add friends and chat with them. The service is free and provided by a team of students as part of the 42 curriculum, for educational and non-commercial purposes.",
          ],
        },
        {
          title: "2. Your account",
          items: [
            "You must be at least 15 years old and provide a valid email address.",
            "Your username must be unique and contain 3 to 24 lowercase letters, digits or underscores.",
            "Keep your password confidential: you are responsible for all activity on your account. Tell the team immediately if you suspect unauthorised use.",
            "One account per person. Do not create accounts in bulk or on behalf of someone else without their consent.",
          ],
        },
        {
          title: "3. Content you publish",
          paragraphs: [
            "You keep all your rights on the music, images and texts you upload. By uploading them, you grant FT GoodVibes a free, non-exclusive licence limited to running the service: storing your files, creating an MP3 preview, extracting embedded artwork, and displaying and streaming the content to the people allowed by the visibility you chose.",
            "This licence ends when you delete the content, except for backup copies, which disappear within 7 days.",
            "You guarantee that you own, or are authorised to use, every right attached to what you publish: recording, composition, lyrics and artwork.",
          ],
        },
        {
          title: "4. Visibility",
          items: [
            "Published tracks and projects, and your artist page, are visible to everyone, including visitors without an account.",
            "Playlists are private by default. A public playlist can be opened by anyone who has its link; making it private again blocks access immediately.",
            "Drafts, unpublished uploads and your listening history remain private.",
          ],
        },
        {
          title: "5. Prohibited behaviour",
          paragraphs: ["When using FT GoodVibes, you must not:"],
          items: [
            "publish content that infringes copyright or other people's rights;",
            "publish illegal, violent, hateful, discriminatory or sexually explicit content, or any content involving minors in a sexual context;",
            "harass, threaten, insult or spam other users, especially through messages;",
            "impersonate another person or artist;",
            "upload malicious files or files disguised as another format;",
            "try to access another user's account or private data, bypass the limits of the service (file sizes, attempt limits) or attack, overload or scan the platform;",
            "collect data automatically or create accounts with scripts.",
          ],
        },
        {
          title: "6. Messages",
          paragraphs: [
            "Messages can only be exchanged between friends; removing someone from your friends prevents new messages between you. You can delete your own messages at any time: they disappear for both participants. Be respectful in your conversations.",
          ],
        },
        {
          title: "7. Limits",
          items: [
            "Audio files: up to 500,000,000 bytes per file. The original is kept and an MP3 preview is created for playback.",
            "Images: up to 25,000,000 bytes, 25 million pixels and 8,192 pixels per side.",
            "Temporary uploads that are not published or reserved for a publication expire after 24 hours.",
            "Repeated sign-up and login attempts are temporarily limited.",
          ],
        },
        {
          title: "8. Moderation",
          paragraphs: [
            "The team may remove content, restrict an account or close it when these terms are broken, when the law requires it or when a rights holder reports an infringement. To report content or behaviour, contact the team that runs this instance.",
          ],
        },
        {
          title: "9. Availability and liability",
          paragraphs: [
            'FT GoodVibes is an educational project provided "as is", without any guarantee of availability or continuity. The service may be interrupted for maintenance and may be shut down at the end of the project. Data is backed up every day, but you should keep your own copy of your files.',
            "To the extent permitted by law, the team is not liable for indirect damage, for the loss of data or for content published by users. Each user is responsible for the content they publish and the messages they send.",
          ],
        },
        {
          title: "10. Ending your use",
          paragraphs: [
            "You can stop using FT GoodVibes at any time and ask the team to delete your account. The team may close an account that seriously or repeatedly breaks these terms.",
          ],
        },
        {
          title: "11. Personal data",
          paragraphs: [
            "The way your personal data is handled is described in the Privacy Policy, available from the footer of every page.",
          ],
        },
        {
          title: "12. Changes and applicable law",
          paragraphs: [
            "These terms may be updated when the application changes; the date at the top of the page shows the latest version. Continuing to use FT GoodVibes after an update means you accept the new version.",
            "These terms are governed by French law. Any dispute will first be resolved amicably with the team.",
          ],
        },
      ],
    },
    fr: {
      title: "Conditions d’utilisation",
      summary:
        "Ces conditions fixent les règles d’utilisation de FT GoodVibes. En créant un compte ou en utilisant le service, vous les acceptez.",
      sections: [
        {
          title: "1. Le service",
          paragraphs: [
            "FT GoodVibes permet de publier, d’écouter et de diffuser de la musique, de l’organiser en playlists, d’ajouter des amis et de discuter avec eux. Le service est gratuit et proposé par une équipe d’étudiants dans le cadre du cursus 42, à des fins pédagogiques et non commerciales.",
          ],
        },
        {
          title: "2. Votre compte",
          items: [
            "Vous devez avoir au moins 15 ans et fournir une adresse e-mail valide.",
            "Votre nom d’utilisateur doit être unique et contenir de 3 à 24 lettres minuscules, chiffres ou tirets bas.",
            "Gardez votre mot de passe confidentiel : vous êtes responsable de toute activité sur votre compte. Prévenez immédiatement l’équipe si vous soupçonnez une utilisation non autorisée.",
            "Un compte par personne. Ne créez pas de comptes en masse, ni au nom de quelqu’un sans son accord.",
          ],
        },
        {
          title: "3. Contenus que vous publiez",
          paragraphs: [
            "Vous conservez tous vos droits sur la musique, les images et les textes que vous envoyez. En les envoyant, vous accordez à FT GoodVibes une licence gratuite et non exclusive, limitée au fonctionnement du service : stocker vos fichiers, créer un aperçu MP3, extraire la pochette intégrée, et afficher et diffuser le contenu aux personnes autorisées par la visibilité que vous avez choisie.",
            "Cette licence prend fin lorsque vous supprimez le contenu, à l’exception des copies de sauvegarde, qui disparaissent sous 7 jours.",
            "Vous garantissez détenir, ou être autorisé à utiliser, tous les droits attachés à ce que vous publiez : enregistrement, composition, paroles et visuels.",
          ],
        },
        {
          title: "4. Visibilité",
          items: [
            "Les morceaux et projets publiés, ainsi que votre page d’artiste, sont visibles par tous, y compris par les visiteurs sans compte.",
            "Les playlists sont privées par défaut. Une playlist publique peut être ouverte par toute personne disposant de son lien ; la rendre privée bloque l’accès immédiatement.",
            "Les brouillons, les fichiers non publiés et votre historique d’écoute restent privés.",
          ],
        },
        {
          title: "5. Comportements interdits",
          paragraphs: [
            "En utilisant FT GoodVibes, vous vous engagez à ne pas :",
          ],
          items: [
            "publier de contenu qui porte atteinte au droit d’auteur ou aux droits d’autrui ;",
            "publier de contenu illégal, violent, haineux, discriminatoire ou sexuellement explicite, ni aucun contenu impliquant des mineurs dans un contexte sexuel ;",
            "harceler, menacer, insulter ou démarcher abusivement d’autres utilisateurs, notamment par message ;",
            "vous faire passer pour une autre personne ou un autre artiste ;",
            "envoyer des fichiers malveillants ou déguisés en un autre format ;",
            "tenter d’accéder au compte ou aux données privées d’un autre utilisateur, contourner les limites du service (tailles de fichiers, limites de tentatives), ni attaquer, surcharger ou scanner la plateforme ;",
            "collecter des données de façon automatisée ou créer des comptes à l’aide de scripts.",
          ],
        },
        {
          title: "6. Messages",
          paragraphs: [
            "Les messages ne peuvent être échangés qu’entre amis ; retirer quelqu’un de vos amis empêche tout nouveau message entre vous. Vous pouvez supprimer vos propres messages à tout moment : ils disparaissent pour les deux participants. Restez respectueux dans vos échanges.",
          ],
        },
        {
          title: "7. Limites",
          items: [
            "Fichiers audio : jusqu’à 500 000 000 octets par fichier. L’original est conservé et un aperçu MP3 est créé pour la lecture.",
            "Images : jusqu’à 25 000 000 octets, 25 millions de pixels et 8 192 pixels par côté.",
            "Les envois temporaires qui ne sont ni publiés ni réservés pour une publication expirent après 24 heures.",
            "Les tentatives répétées d’inscription et de connexion sont temporairement limitées.",
          ],
        },
        {
          title: "8. Modération",
          paragraphs: [
            "L’équipe peut retirer un contenu, restreindre un compte ou le fermer en cas de non-respect de ces conditions, lorsque la loi l’exige ou lorsqu’un ayant droit signale une atteinte à ses droits. Pour signaler un contenu ou un comportement, contactez l’équipe qui fait fonctionner cette instance.",
          ],
        },
        {
          title: "9. Disponibilité et responsabilité",
          paragraphs: [
            "FT GoodVibes est un projet pédagogique fourni « en l’état », sans garantie de disponibilité ni de continuité. Le service peut être interrompu pour maintenance et arrêté à la fin du projet. Les données sont sauvegardées chaque jour, mais nous vous conseillons de garder votre propre copie de vos fichiers.",
            "Dans les limites permises par la loi, l’équipe n’est pas responsable des dommages indirects, de la perte de données ni des contenus publiés par les utilisateurs. Chaque utilisateur est responsable des contenus qu’il publie et des messages qu’il envoie.",
          ],
        },
        {
          title: "10. Fin de l’utilisation",
          paragraphs: [
            "Vous pouvez cesser d’utiliser FT GoodVibes à tout moment et demander à l’équipe la suppression de votre compte. L’équipe peut fermer un compte qui enfreint gravement ou de façon répétée ces conditions.",
          ],
        },
        {
          title: "11. Données personnelles",
          paragraphs: [
            "Le traitement de vos données personnelles est décrit dans la politique de confidentialité, accessible depuis le pied de chaque page.",
          ],
        },
        {
          title: "12. Modifications et droit applicable",
          paragraphs: [
            "Ces conditions peuvent être mises à jour lorsque l’application évolue ; la date en haut de la page indique la version en vigueur. Continuer à utiliser FT GoodVibes après une mise à jour vaut acceptation de la nouvelle version.",
            "Ces conditions sont régies par le droit français. Tout litige sera d’abord traité à l’amiable avec l’équipe.",
          ],
        },
      ],
    },
    es: {
      title: "Condiciones de uso",
      summary:
        "Estas condiciones establecen las reglas para usar FT GoodVibes. Al crear una cuenta o utilizar el servicio, las aceptas.",
      sections: [
        {
          title: "1. El servicio",
          paragraphs: [
            "FT GoodVibes te permite subir, publicar y escuchar música, organizarla en playlists, añadir amigos y chatear con ellos. El servicio es gratuito y lo ofrece un equipo de estudiantes en el marco del programa 42, con fines educativos y sin fines comerciales.",
          ],
        },
        {
          title: "2. Tu cuenta",
          items: [
            "Debes tener al menos 15 años y proporcionar una dirección de correo electrónico válida.",
            "Tu nombre de usuario debe ser único y contener de 3 a 24 letras minúsculas, cifras o guiones bajos.",
            "Mantén tu contraseña en secreto: eres responsable de toda la actividad de tu cuenta. Avisa de inmediato al equipo si sospechas un uso no autorizado.",
            "Una cuenta por persona. No crees cuentas de forma masiva ni en nombre de otra persona sin su consentimiento.",
          ],
        },
        {
          title: "3. Contenido que publicas",
          paragraphs: [
            "Conservas todos tus derechos sobre la música, las imágenes y los textos que subes. Al subirlos, concedes a FT GoodVibes una licencia gratuita y no exclusiva, limitada al funcionamiento del servicio: almacenar tus archivos, crear una vista previa en MP3, extraer la portada integrada y mostrar y reproducir el contenido para las personas permitidas por la visibilidad que elegiste.",
            "Esta licencia termina cuando eliminas el contenido, salvo las copias de seguridad, que desaparecen en un plazo de 7 días.",
            "Garantizas que eres titular, o que tienes autorización para usar, todos los derechos de lo que publicas: grabación, composición, letra e imágenes.",
          ],
        },
        {
          title: "4. Visibilidad",
          items: [
            "Las canciones y proyectos publicados, así como tu página de artista, son visibles para todos, incluidos los visitantes sin cuenta.",
            "Las playlists son privadas por defecto. Cualquier persona con el enlace puede abrir una playlist pública; volver a hacerla privada bloquea el acceso inmediatamente.",
            "Los borradores, los archivos no publicados y tu historial de escucha siguen siendo privados.",
          ],
        },
        {
          title: "5. Comportamientos prohibidos",
          paragraphs: ["Al usar FT GoodVibes, te comprometes a no:"],
          items: [
            "publicar contenido que infrinja los derechos de autor u otros derechos de terceros;",
            "publicar contenido ilegal, violento, de odio, discriminatorio o sexualmente explícito, ni ningún contenido que implique a menores en un contexto sexual;",
            "acosar, amenazar, insultar o enviar spam a otros usuarios, especialmente por mensajes;",
            "hacerte pasar por otra persona u otro artista;",
            "subir archivos maliciosos o disfrazados de otro formato;",
            "intentar acceder a la cuenta o a los datos privados de otro usuario, eludir los límites del servicio (tamaños de archivo, límites de intentos) ni atacar, sobrecargar o escanear la plataforma;",
            "recopilar datos de forma automatizada ni crear cuentas mediante scripts.",
          ],
        },
        {
          title: "6. Mensajes",
          paragraphs: [
            "Los mensajes solo pueden intercambiarse entre amigos; eliminar a alguien de tus amigos impide nuevos mensajes entre vosotros. Puedes eliminar tus propios mensajes en cualquier momento: desaparecen para ambos participantes. Sé respetuoso en tus conversaciones.",
          ],
        },
        {
          title: "7. Límites",
          items: [
            "Archivos de audio: hasta 500 000 000 bytes por archivo. Se conserva el original y se crea una vista previa en MP3 para la reproducción.",
            "Imágenes: hasta 25 000 000 bytes, 25 millones de píxeles y 8192 píxeles por lado.",
            "Las subidas temporales que no se publican ni se reservan para una publicación caducan a las 24 horas.",
            "Los intentos repetidos de registro e inicio de sesión se limitan temporalmente.",
          ],
        },
        {
          title: "8. Moderación",
          paragraphs: [
            "El equipo puede retirar contenido, restringir una cuenta o cerrarla cuando se incumplan estas condiciones, cuando la ley lo exija o cuando un titular de derechos denuncie una infracción. Para denunciar un contenido o un comportamiento, contacta con el equipo que gestiona esta instancia.",
          ],
        },
        {
          title: "9. Disponibilidad y responsabilidad",
          paragraphs: [
            "FT GoodVibes es un proyecto educativo ofrecido «tal cual», sin garantía de disponibilidad ni de continuidad. El servicio puede interrumpirse por mantenimiento y cerrarse al final del proyecto. Los datos se copian cada día, pero te recomendamos conservar tu propia copia de tus archivos.",
            "En la medida en que lo permita la ley, el equipo no es responsable de los daños indirectos, de la pérdida de datos ni del contenido publicado por los usuarios. Cada usuario es responsable del contenido que publica y de los mensajes que envía.",
          ],
        },
        {
          title: "10. Fin del uso",
          paragraphs: [
            "Puedes dejar de usar FT GoodVibes en cualquier momento y pedir al equipo que elimine tu cuenta. El equipo puede cerrar una cuenta que incumpla estas condiciones de forma grave o reiterada.",
          ],
        },
        {
          title: "11. Datos personales",
          paragraphs: [
            "El tratamiento de tus datos personales se describe en la Política de privacidad, accesible desde el pie de cada página.",
          ],
        },
        {
          title: "12. Cambios y legislación aplicable",
          paragraphs: [
            "Estas condiciones pueden actualizarse cuando la aplicación cambie; la fecha en la parte superior de la página indica la versión vigente. Seguir usando FT GoodVibes después de una actualización implica aceptar la nueva versión.",
            "Estas condiciones se rigen por la legislación francesa. Cualquier conflicto se resolverá primero de forma amistosa con el equipo.",
          ],
        },
      ],
    },
  },
};
