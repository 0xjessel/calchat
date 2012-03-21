package model;

public class TermModel {
	public String name;
	public String year;
	public String updated;
	public ClassModel[] classes;

	

	public TermModel(String name, String year, String updated,
			ClassModel[] classes) {
		super();
		this.name = name;
		this.year = year;
		this.updated = updated;
		this.classes = classes;
	}

	@Override
	public String toString() {
		return String.format("TermModel: %s %s (%s)", name, year, updated);
	}
}
