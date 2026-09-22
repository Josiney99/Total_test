import inquirer from 'inquirer';

// ---------- ações de cada opção ----------

async function executar(option) {
  switch (option) {
    case 'rapido':
      console.log('\n[Teste rápido] (a implementar)');
      break;
    case 'avancado':
      console.log('\n[Teste avançado] (a implementar)');
      break;
    case 'cpu':
      console.log('\n[CPU] (a implementar)');
      break;
    case 'ram':
      console.log('\n[RAM] (a implementar)');
      break;
    case 'disco':
      console.log('\n[SSD/HD] (a implementar)');
      break;
    case 'bateria':
      console.log('\n[BATERIA] (a implementar)');
      break;
  }
}

// ---------- menu ----------

async function menuPrincipal() {
  while (true) {
    console.clear();
    const { option } = await inquirer.prompt([
      {
        type: 'select',
        name: 'option',
        message: 'Selecione o tipo do teste :',
        choices: [
          { name: 'Teste rápido', value: 'rapido' },
          { name: 'Teste avançado', value: 'avancado' },
          { name: 'CPU', value: 'cpu' },
          { name: 'RAM', value: 'ram' },
          { name: 'SSD/HD', value: 'disco' },
          { name: 'BATERIA', value: 'bateria' },
          { name: 'Sair', value: 'sair' },
        ],
      },
    ]);

    if (option === 'sair') {
      console.log('Até logo!');
      return;
    }

    await executar(option);

    const { voltar } = await inquirer.prompt([
      {
        type: 'select',
        name: 'voltar',
        message: ' ',
        choices: [
          { name: '← Voltar ao menu', value: 'menu' },
          { name: 'Sair', value: 'sair' },
        ],
      },
    ]);

    if (voltar === 'sair') {
      console.log('Até logo!');
      return;
    }
    // voltar === 'menu' -> o while repete e mostra o menu principal de novo
  }
}

menuPrincipal().catch((err) => {
  // Ctrl+C dentro de um prompt lança este erro; tratamos como saída normal
  if (err.name === 'ExitPromptError') {
    console.log('\nAté logo!');
  } else {
    throw err;
  }
});