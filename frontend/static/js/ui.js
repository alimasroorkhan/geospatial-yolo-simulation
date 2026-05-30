(function () {
  function setText(node, value) {
    if (node) node.textContent = value;
  }

  window.UavUi = {
    setText,
  };
}());
