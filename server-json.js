const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Fichier de base de données JSON
const DB_FILE = path.join(__dirname, 'database.json');


// Structure de la base de données
let db = {
    livreurs: [],
    livraisons: [],
    versements: []
};

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

// Générer un ID unique
function generateId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
}

// ═══════════════════════════════════════════════════
// ROUTES API - LIVREURS
// ═══════════════════════════════════════════════════

// Obtenir tous les livreurs
app.get('/api/livreurs', (req, res) => {
    res.json(db.livreurs.sort((a, b) => a.nom.localeCompare(b.nom)));
});

// Ajouter un livreur
app.post('/api/livreurs', (req, res) => {
    const { nom } = req.body;
    
    if (!nom || nom.trim() === '') {
        return res.status(400).json({ error: 'Le nom est requis' });
    }

    // Vérifier si le livreur existe déjà
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

// Supprimer un livreur
app.delete('/api/livreurs/:id', (req, res) => {
    const { id } = req.params;
    
    const index = db.livreurs.findIndex(l => l.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Livreur non trouvé' });
    }

    // Supprimer aussi toutes ses livraisons et versements
    db.livraisons = db.livraisons.filter(liv => liv.livreur_id !== id);
    db.versements = db.versements.filter(v => v.livreur_id !== id);
    db.livreurs.splice(index, 1);
    
    saveDatabase();
    res.json({ deleted: true });
});

// ═══════════════════════════════════════════════════
// ROUTES API - LIVRAISONS
// ═══════════════════════════════════════════════════

// Obtenir les livraisons d'un livreur pour un mois
app.get('/api/livraisons/:livreurId/:annee/:mois', (req, res) => {
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

// Obtenir toutes les livraisons pour un mois (tous livreurs)
app.get('/api/livraisons/global/:annee/:mois', (req, res) => {
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

// Enregistrer/Modifier une livraison
app.post('/api/livraisons', (req, res) => {
    const { livreurId, annee, mois, jour, quantite } = req.body;
    
    if (!livreurId || !annee || !mois || !jour) {
        return res.status(400).json({ error: 'Données incomplètes' });
    }

    const qte = parseFloat(quantite) || 0;

    // Trouver une livraison existante
    const index = db.livraisons.findIndex(l =>
        l.livreur_id === livreurId &&
        l.annee === parseInt(annee) &&
        l.mois === parseInt(mois) &&
        l.jour === parseInt(jour)
    );

    if (qte === 0) {
        // Supprimer si quantité = 0
        if (index !== -1) {
            db.livraisons.splice(index, 1);
            saveDatabase();
        }
        res.json({ success: true, deleted: true });
    } else {
        // Mettre à jour ou créer
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
            // Mise à jour
            db.livraisons[index] = { ...db.livraisons[index], ...livraison };
        } else {
            // Création
            livraison.id = generateId();
            db.livraisons.push(livraison);
        }

        saveDatabase();
        res.json({ success: true });
    }
});

// ═══════════════════════════════════════════════════
// ROUTES API - VERSEMENTS
// ═══════════════════════════════════════════════════

// Obtenir tous les versements d'un livreur pour un mois
app.get('/api/versements/:livreurId/:annee/:mois', (req, res) => {
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

// Obtenir tous les versements pour un mois (tous livreurs)
app.get('/api/versements/global/:annee/:mois', (req, res) => {
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

// Enregistrer un versement
app.post('/api/versements', (req, res) => {
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

// Supprimer un versement
app.delete('/api/versements/:id', (req, res) => {
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
// ROUTES API - STATISTIQUES
// ═══════════════════════════════════════════════════

// Obtenir les statistiques d'un livreur pour un mois
app.get('/api/stats/:livreurId/:annee/:mois', (req, res) => {
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

// Obtenir les statistiques complètes d'un livreur (livraisons + versements)
app.get('/api/statistiques-completes/:livreurId/:annee/:mois', (req, res) => {
    const { livreurId, annee, mois } = req.params;
    
    // Livraisons
    const livraisons = db.livraisons.filter(l =>
        l.livreur_id === livreurId &&
        l.annee === parseInt(annee) &&
        l.mois === parseInt(mois)
    );

    const total_livraisons = livraisons.reduce((sum, l) => sum + l.quantite, 0);
    const total_montant_livraisons = livraisons.reduce((sum, l) => sum + (l.quantite * l.prix_unitaire), 0);

    // Versements
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

// Obtenir le classement des livreurs pour un mois
app.get('/api/classement/:annee/:mois', (req, res) => {
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

// Effacer toutes les données
app.delete('/api/reset', (req, res) => {
    db = { livreurs: [], livraisons: [], versements: [] };
    saveDatabase();
    res.json({ success: true, message: 'Toutes les données ont été effacées' });
});

// ═══════════════════════════════════════════════════
// SAUVEGARDE AUTOMATIQUE
// ═══════════════════════════════════════════════════

// Sauvegarde automatique toutes les 5 minutes
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
║   🥛 SERVEUR GESTION LAIT DÉMARRÉ     ║
╚════════════════════════════════════════╝
    
📡 URL: http://localhost:${PORT}
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