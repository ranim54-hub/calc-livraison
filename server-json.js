const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const PORT = 3000;

// ═══════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════

// Middleware
app.use(bodyParser.json());

// Configuration des sessions
app.use(session({
    secret: 'zekrini-salim-lait-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Mettre true si HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 heures
    }
}));

app.use(express.static('public'));

// Fichier de base de données JSON
const DB_FILE = path.join(__dirname, 'database.json');

// Identifiants de connexion (vous pouvez les stocker ailleurs pour plus de sécurité)
const VALID_USERNAME = 'salim';
const VALID_PASSWORD = 'salim24';

// Structure de la base de données
let db = {
    livreurs: [],
    livraisons: [],
    versements: []
};

// ═══════════════════════════════════════════════════
// MIDDLEWARE D'AUTHENTIFICATION
// ═══════════════════════════════════════════════════

function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    } else {
        return res.status(401).json({ error: 'Non authentifié' });
    }
}

// ═══════════════════════════════════════════════════
// ROUTES D'AUTHENTIFICATION
// ═══════════════════════════════════════════════════

// Vérifier l'authentification
app.get('/api/auth/check', (req, res) => {
    res.json({ 
        authenticated: req.session && req.session.authenticated === true 
    });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        req.session.authenticated = true;
        req.session.username = username;
        
        console.log(`✓ Connexion réussie: ${username} à ${new Date().toLocaleString('fr-FR')}`);
        
        res.json({ 
            success: true, 
            message: 'Connexion réussie' 
        });
    } else {
        console.log(`✗ Tentative de connexion échouée à ${new Date().toLocaleString('fr-FR')}`);
        
        res.status(401).json({ 
            error: 'Identifiants invalides' 
        });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    const username = req.session.username;
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur de déconnexion' });
        }
        
        console.log(`✓ Déconnexion: ${username || 'Utilisateur'} à ${new Date().toLocaleString('fr-FR')}`);
        
        res.json({ success: true, message: 'Déconnexion réussie' });
    });
});

// ═══════════════════════════════════════════════════
// GESTION DE LA BASE DE DONNÉES JSON
// ═══════════════════════════════════════════════════

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
            console.log('✓ Base de données chargée');
        } else {
            saveDatabase();
            console.log('✓ Nouvelle base de données créée');
        }
    } catch (error) {
        console.error('Erreur de chargement:', error);
        db = { livreurs: [], livraisons: [], versements: [] };
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (error) {
        console.error('Erreur de sauvegarde:', error);
    }
}

function generateId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
}

// ═══════════════════════════════════════════════════
// ROUTES API - LIVREURS (PROTÉGÉES)
// ═══════════════════════════════════════════════════

app.get('/api/livreurs', requireAuth, (req, res) => {
    res.json(db.livreurs.sort((a, b) => a.nom.localeCompare(b.nom)));
});

app.post('/api/livreurs', requireAuth, (req, res) => {
    const { nom } = req.body;
    
    if (!nom || nom.trim() === '') {
        return res.status(400).json({ error: 'Le nom est requis' });
    }

    const exists = db.livreurs.find(l => l.nom.toLowerCase() === nom.trim().toLowerCase());
    if (exists) {
        return res.status(409).json({ error: 'Ce livreur existe déjà' });
    }

    const newLivreur = {
        id: generateId(),
        nom: nom.trim(),
        date_ajout: new Date().toISOString()
    };

    db.livreurs.push(newLivreur);
    saveDatabase();
    
    res.json(newLivreur);
});

app.delete('/api/livreurs/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    const index = db.livreurs.findIndex(l => l.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Livreur non trouvé' });
    }

    db.livraisons = db.livraisons.filter(liv => liv.livreur_id !== id);
    db.versements = db.versements.filter(v => v.livreur_id !== id);
    db.livreurs.splice(index, 1);
    
    saveDatabase();
    res.json({ deleted: true });
});

// ═══════════════════════════════════════════════════
// ROUTES API - LIVRAISONS (PROTÉGÉES)
// ═══════════════════════════════════════════════════

app.get('/api/livraisons/:livreurId/:annee/:mois', requireAuth, (req, res) => {
    const { livreurId, annee, mois } = req.params;
    
    const livraisons = db.livraisons
        .filter(l => 
            l.livreur_id === livreurId && 
            l.annee === parseInt(annee) && 
            l.mois === parseInt(mois)
        )
        .map(l => ({
            jour: l.jour,
            quantite: l.quantite,
            montant_total: l.quantite * l.prix_unitaire
        }))
        .sort((a, b) => a.jour - b.jour);
    
    res.json(livraisons);
});

app.get('/api/livraisons/global/:annee/:mois', requireAuth, (req, res) => {
    const { annee, mois } = req.params;
    
    const livraisons = db.livraisons
        .filter(l => 
            l.annee === parseInt(annee) && 
            l.mois === parseInt(mois)
        )
        .map(l => {
            const livreur = db.livreurs.find(liv => liv.id === l.livreur_id);
            return {
                jour: l.jour,
                quantite: l.quantite,
                montant_total: l.quantite * l.prix_unitaire,
                livreur_nom: livreur ? livreur.nom : 'Inconnu',
                livreur_id: l.livreur_id
            };
        })
        .sort((a, b) => a.jour - b.jour);
    
    res.json(livraisons);
});

app.post('/api/livraisons', requireAuth, (req, res) => {
    const { livreurId, annee, mois, jour, quantite } = req.body;
    
    if (!livreurId || !annee || !mois || !jour) {
        return res.status(400).json({ error: 'Données incomplètes' });
    }

    const qte = parseFloat(quantite) || 0;

    const index = db.livraisons.findIndex(l =>
        l.livreur_id === livreurId &&
        l.annee === parseInt(annee) &&
        l.mois === parseInt(mois) &&
        l.jour === parseInt(jour)
    );

    if (qte === 0) {
        if (index !== -1) {
            db.livraisons.splice(index, 1);
            saveDatabase();
        }
        res.json({ success: true, deleted: true });
    } else {
        const livraison = {
            livreur_id: livreurId,
            annee: parseInt(annee),
            mois: parseInt(mois),
            jour: parseInt(jour),
            quantite: qte,
            prix_unitaire: 75,
            date_saisie: new Date().toISOString()
        };

        if (index !== -1) {
            db.livraisons[index] = { ...db.livraisons[index], ...livraison };
        } else {
            livraison.id = generateId();
            db.livraisons.push(livraison);
        }

        saveDatabase();
        res.json({ success: true });
    }
});

// ═══════════════════════════════════════════════════
// ROUTES API - VERSEMENTS (PROTÉGÉES)
// ═══════════════════════════════════════════════════

app.get('/api/versements/:livreurId/:annee/:mois', requireAuth, (req, res) => {
    const { livreurId, annee, mois } = req.params;
    
    const versements = db.versements
        .filter(v => 
            v.livreur_id === livreurId && 
            v.annee === parseInt(annee) && 
            v.mois === parseInt(mois)
        )
        .sort((a, b) => a.jour - b.jour);
    
    res.json(versements);
});

app.get('/api/versements/global/:annee/:mois', requireAuth, (req, res) => {
    const { annee, mois } = req.params;
    
    const versements = db.versements
        .filter(v => 
            v.annee === parseInt(annee) && 
            v.mois === parseInt(mois)
        )
        .map(v => {
            const livreur = db.livreurs.find(l => l.id === v.livreur_id);
            return {
                id: v.id,
                livreur_id: v.livreur_id,
                livreur_nom: livreur ? livreur.nom : 'Inconnu',
                jour: v.jour,
                montant: v.montant,
                description: v.description,
                date_creation: v.date_creation
            };
        })
        .sort((a, b) => a.jour - b.jour);
    
    res.json(versements);
});

app.post('/api/versements', requireAuth, (req, res) => {
    const { livreurId, annee, mois, jour, montant, description } = req.body;
    
    if (!livreurId || !annee || !mois || !jour || !montant) {
        return res.status(400).json({ error: 'Données incomplètes' });
    }

    const versement = {
        id: generateId(),
        livreur_id: livreurId,
        annee: parseInt(annee),
        mois: parseInt(mois),
        jour: parseInt(jour),
        montant: parseFloat(montant),
        description: description || 'Versement',
        date_creation: new Date().toISOString()
    };

    db.versements.push(versement);
    saveDatabase();
    res.json({ success: true, versement });
});

app.delete('/api/versements/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    const index = db.versements.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Versement non trouvé' });
    }

    db.versements.splice(index, 1);
    saveDatabase();
    res.json({ deleted: true });
});

// ═══════════════════════════════════════════════════
// ROUTES API - STATISTIQUES (PROTÉGÉES)
// ═══════════════════════════════════════════════════

app.get('/api/stats/:livreurId/:annee/:mois', requireAuth, (req, res) => {
    const { livreurId, annee, mois } = req.params;
    
    const livraisons = db.livraisons.filter(l =>
        l.livreur_id === livreurId &&
        l.annee === parseInt(annee) &&
        l.mois === parseInt(mois)
    );

    const stats = {
        jours_travailles: livraisons.length,
        total_litres: livraisons.reduce((sum, l) => sum + l.quantite, 0),
        total_montant: livraisons.reduce((sum, l) => sum + (l.quantite * l.prix_unitaire), 0),
        moyenne_par_jour: livraisons.length > 0 
            ? livraisons.reduce((sum, l) => sum + l.quantite, 0) / livraisons.length 
            : 0
    };

    res.json(stats);
});

app.get('/api/statistiques-completes/:livreurId/:annee/:mois', requireAuth, (req, res) => {
    const { livreurId, annee, mois } = req.params;
    
    const livraisons = db.livraisons.filter(l =>
        l.livreur_id === livreurId &&
        l.annee === parseInt(annee) &&
        l.mois === parseInt(mois)
    );

    const total_livraisons = livraisons.reduce((sum, l) => sum + l.quantite, 0);
    const total_montant_livraisons = livraisons.reduce((sum, l) => sum + (l.quantite * l.prix_unitaire), 0);

    const versements = db.versements.filter(v =>
        v.livreur_id === livreurId &&
        v.annee === parseInt(annee) &&
        v.mois === parseInt(mois)
    );

    const total_versements = versements.reduce((sum, v) => sum + v.montant, 0);
    const solde = total_montant_livraisons - total_versements;

    const stats = {
        total_litres: total_livraisons,
        total_montant_livraisons: total_montant_livraisons,
        total_versements: total_versements,
        solde: solde,
        jours_travailles: livraisons.length,
        nombre_versements: versements.length
    };

    res.json(stats);
});

app.get('/api/classement/:annee/:mois', requireAuth, (req, res) => {
    const { annee, mois } = req.params;
    
    const classement = db.livreurs.map(livreur => {
        const livraisons = db.livraisons.filter(l =>
            l.livreur_id === livreur.id &&
            l.annee === parseInt(annee) &&
            l.mois === parseInt(mois)
        );

        const total_litres = livraisons.reduce((sum, l) => sum + l.quantite, 0);
        const total_montant = livraisons.reduce((sum, l) => sum + (l.quantite * l.prix_unitaire), 0);

        return {
            id: livreur.id,
            nom: livreur.nom,
            total_litres,
            total_montant,
            jours_travailles: livraisons.length
        };
    }).sort((a, b) => b.total_litres - a.total_litres);

    res.json(classement);
});

app.delete('/api/reset', requireAuth, (req, res) => {
    db = { livreurs: [], livraisons: [], versements: [] };
    saveDatabase();
    
    console.log(`⚠️ RESET: Base de données effacée par ${req.session.username} à ${new Date().toLocaleString('fr-FR')}`);
    
    res.json({ success: true, message: 'Toutes les données ont été effacées' });
});

// ═══════════════════════════════════════════════════
// SAUVEGARDE AUTOMATIQUE
// ═══════════════════════════════════════════════════

setInterval(() => {
    saveDatabase();
    console.log('✓ Sauvegarde automatique effectuée');
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════
// ROUTE PRINCIPALE
// ═══════════════════════════════════════════════════

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════════════════════════

loadDatabase();

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🥛 SERVEUR GESTION LAIT SÉCURISÉ    ║
╚════════════════════════════════════════╝
    
📡 URL: http://localhost:${PORT}
🔐 Authentification: Activée
   Username: ${VALID_USERNAME}
   Password: ********
📊 Base de données: JSON (database.json)
💾 Sauvegarde: Automatique toutes les 5 min
⏰ Démarré le: ${new Date().toLocaleString('fr-FR')}

Livreurs: ${db.livreurs.length}
Livraisons: ${db.livraisons.length}
Versements: ${db.versements.length}
    `);
});

// Fermeture propre
process.on('SIGINT', () => {
    console.log('\n✓ Sauvegarde finale...');
    saveDatabase();
    console.log('✓ Base de données sauvegardée');
    process.exit(0);
});

process.on('SIGTERM', () => {
    saveDatabase();
    process.exit(0);
});
