<?php
/**
 * flow-php-parser.php — PHP-Parser extractor for Flow tree-sitter indexing.
 *
 * Usage: php flow-php-parser.php <file-path>
 * Output: JSON with functions, classes, includes, string_literals_flagged,
 *         line_count, size_kb, parse_error
 *
 * Requires: nikic/php-parser (installed via Composer in ~/.flow/tools/)
 */

if ($argc < 2) {
    echo json_encode(['error' => 'No file path provided']) . "\n";
    exit(1);
}

$batchMode = ($argv[1] === '--batch');

if ($batchMode) {
    // Batch mode: argv[2] is path to a file containing newline-delimited PHP file paths
    if ($argc < 3) {
        echo json_encode(['error' => 'No batch file provided']) . "\n";
        exit(1);
    }
    $listFile = $argv[2];
    if (!file_exists($listFile) || !is_readable($listFile)) {
        echo json_encode(['error' => "Batch list file not found: $listFile"]) . "\n";
        exit(1);
    }
} else {
    // Single-file mode (backward compat)
    $filePath = $argv[1];
    if (!file_exists($filePath) || !is_readable($filePath)) {
        echo json_encode(['error' => "File not found or not readable: $filePath"]) . "\n";
        exit(1);
    }
}

// Locate autoloader from same directory as this script
$autoloaderCandidates = [
    __DIR__ . '/vendor/autoload.php',
    __DIR__ . '/../vendor/autoload.php',
];

$autoloader = null;
foreach ($autoloaderCandidates as $candidate) {
    if (file_exists($candidate)) {
        $autoloader = $candidate;
        break;
    }
}

if (!$autoloader) {
    echo json_encode(['error' => 'PHP-Parser autoloader not found. Run: composer require nikic/php-parser']) . "\n";
    exit(1);
}

require_once $autoloader;

use PhpParser\Error;
use PhpParser\Node;
use PhpParser\NodeTraverser;
use PhpParser\NodeVisitorAbstract;
use PhpParser\ParserFactory;

class FlowVisitor extends NodeVisitorAbstract
{
    public array $functions = [];
    public array $classes = [];
    public array $includes = [];

    public function enterNode(Node $node): void
    {
        // Function definitions (including closures assigned to variables)
        if ($node instanceof Node\Stmt\Function_) {
            $this->functions[] = $node->name->name;
        }

        // Class methods
        if ($node instanceof Node\Stmt\ClassMethod) {
            $this->functions[] = $node->name->name;
        }

        // Class, interface, trait, enum declarations
        if ($node instanceof Node\Stmt\Class_) {
            if ($node->name) {
                $this->classes[] = $node->name->name;
            }
        }
        if ($node instanceof Node\Stmt\Interface_) {
            if ($node->name) {
                $this->classes[] = 'interface:' . $node->name->name;
            }
        }
        if ($node instanceof Node\Stmt\Trait_) {
            if ($node->name) {
                $this->classes[] = 'trait:' . $node->name->name;
            }
        }
        if ($node instanceof Node\Stmt\Enum_) {
            if ($node->name) {
                $this->classes[] = 'enum:' . $node->name->name;
            }
        }

        // Global constants: const FOO = bar;
        if ($node instanceof Node\Stmt\Const_) {
            foreach ($node->consts as $const) {
                $this->functions[] = 'const:' . $const->name->name;
            }
        }

        // Global constants: define('FOO', 'bar');
        if ($node instanceof Node\Expr\FuncCall) {
            if ($node->name instanceof Node\Name && strtolower($node->name->toString()) === 'define') {
                if (isset($node->args[0])) {
                    $arg = $node->args[0]->value;
                    if ($arg instanceof Node\Scalar\String_) {
                        $this->functions[] = 'define:' . $arg->value;
                    }
                }
            }
        }

        // Include/require expressions
        if ($node instanceof Node\Expr\Include_) {
            $resolved = $this->resolveInclude($node->expr);
            if ($resolved !== null) {
                $this->includes[] = $resolved;
            }
        }

        // use statements (namespace imports)
        if ($node instanceof Node\Stmt\UseUse) {
            $this->includes[] = $node->name->toString();
        }
    }

    /**
     * Resolve an include expression to a string path.
     */
    private function resolveInclude(Node $expr): ?string
    {
        // Direct string literal: require 'file.php';
        if ($expr instanceof Node\Scalar\String_) {
            return $expr->value;
        }

        // Concatenated expression: require __DIR__ . '/file.php';
        if ($expr instanceof Node\Expr\BinaryOp\Concat) {
            $parts = [];
            $current = $expr;
            while ($current instanceof Node\Expr\BinaryOp\Concat) {
                $part = $this->resolveConcatPart($current->right);
                if ($part === null) return null;
                array_unshift($parts, $part);
                $current = $current->left;
            }
            $last = $this->resolveConcatPart($current);
            if ($last === null) return null;
            array_unshift($parts, $last);
            return implode('', $parts);
        }

        // Ternary for optional include paths
        if ($expr instanceof Node\Expr\Ternary) {
            // Try the "then" branch (the common case)
            if ($expr->if !== null) {
                return $this->resolveInclude($expr->if);
            }
            return null;
        }

        return null;
    }

    private function resolveConcatPart(Node $node): ?string
    {
        if ($node instanceof Node\Scalar\String_) {
            return $node->value;
        }
        if ($node instanceof Node\Expr\ConstFetch) {
            $name = strtolower($node->name->toString());
            // Resolve well-known constants
            if ($name === '__dir__') {
                global $filePath;
                return dirname($filePath);
            }
            if ($name === '__file__') {
                global $filePath;
                return $filePath;
            }
            // Return constant name as placeholder
            return '{' . $node->name->toString() . '}';
        }
        return null;
    }
}

/**
 * Parse a single PHP file and return a result array.
 */
function parseFile(string $filePath, ParserFactory $parserFactory): array
{
    $source = file_get_contents($filePath);
    $lineCount = count(explode("\n", $source));
    $sizeKb = round(strlen($source) / 1024, 1);

    $parser = $parserFactory->createForNewestSupportedVersion();

    try {
        $ast = $parser->parse($source);

        $traverser = new NodeTraverser();
        $visitor = new FlowVisitor();
        $traverser->addVisitor($visitor);
        $traverser->traverse($ast);

        return [
            'language'               => 'php',
            'functions'              => array_values(array_unique($visitor->functions)),
            'classes'                => array_values(array_unique($visitor->classes)),
            'includes'               => array_values(array_unique($visitor->includes)),
            'string_literals_flagged'=> [],
            'line_count'             => $lineCount,
            'size_kb'                => $sizeKb,
            'parse_error'            => false,
        ];
    } catch (Error $e) {
        return [
            'language'               => 'php',
            'functions'              => [],
            'classes'                => [],
            'includes'               => [],
            'string_literals_flagged'=> [],
            'line_count'             => $lineCount,
            'size_kb'                => $sizeKb,
            'parse_error'            => true,
        ];
    }
}

$factory = new ParserFactory();

if ($batchMode) {
    // Read file list, parse each, emit JSON object keyed by absolute path
    $paths = array_filter(
        array_map('trim', file($listFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES))
    );
    $results = [];
    foreach ($paths as $fp) {
        $fp = str_replace('\\', '/', $fp);  // normalise Windows separators
        $results[$fp] = parseFile($fp, $factory);
    }
    echo json_encode($results) . "\n";
} else {
    // Single-file mode (backward compat)
    echo json_encode(parseFile($filePath, $factory)) . "\n";
}
